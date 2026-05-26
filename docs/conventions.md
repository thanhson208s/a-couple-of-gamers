# Conventions

Code patterns, developer workflow, and repeatable processes. Read this before writing any feature code.

→ Local dev setup: [README.md](../README.md)

---

## Contents

**Git**
- [Branching Strategy](#branching-strategy)
- [Commit Conventions](#commit-conventions)

**Code**
- [Guards & Authentication](#guards--authentication)
- [Error Handling](#error-handling)
- [DTOs & Validation](#dtos--validation)
- [Module Communication](#module-communication)
- [BullMQ Jobs](#bullmq-jobs)
- [Testing](#testing)
- [Entity & Migration Conventions](#entity--migration-conventions)

**Workflows**
- [Database Migrations](#database-migrations)
- [Adding a Module](#adding-a-module)
- [Adding an Entity](#adding-an-entity)
- [Adding a New Game](#adding-a-new-game)

**Checklists**
- [Feature Implementation Checklist](#feature-implementation-checklist)
- [PR Checklist](#pr-checklist)

---

## Branching Strategy

| Branch / ref | Purpose |
|---|---|
| `main` | Integration branch. All feature PRs merge here. Auto-deploys to staging on every push that touches app/infra code (docs-only pushes are skipped). |
| `{feature, fix}/<name>` | Short-lived branches for a single feature or fix. Branch from `main`, PR back to `main`. |
| `v<major>.<minor>.<patch>` | Release tag cut from `main` (e.g. `v1.2.3`). Builds a versioned image; use it to trigger the manual production deploy. |

### Typical flow

```
git checkout -b feature/my-thing   # branch from main
# ... work ...
git push && gh pr create           # CI (lint + tests) runs on the PR
# merge → staging auto-deploys

git tag v1.2.3 && git push --tags  # when ready for production
# run "Deploy to Production" workflow with tag v1.2.3
```

**Never push directly to `main`.** Every change goes through a PR so CI runs first.

---

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

Types:
  feat     — new feature
  fix      — bug or error patch
  refactor — code change that is neither a fix nor a feat
  docs     — documentation only
  test     — adding or correcting tests
  chore    — routine tasks, maintenance, tooling changes

Scope: server | client | infra | db  (optional)

Examples:
  feat(server): add WS presence tracking per match
  fix(client): correct lobby badge count on resume
  docs: add match-lifecycle feature doc
  chore(db): add migration for rival_stats index
```

---

## Guards & Authentication

Four guards live in `modules/auth/guards/`. All are exported from `AuthModule` — import `AuthModule` in your module to use them.

| Guard | Use when |
|-------|---------|
| `JwtAuthGuard` | Endpoint requires an authenticated user (social or guest JWT) |
| `AdminAuthGuard` | Endpoint is admin-only (`X-Admin-Token` header) |
| `DevAuthGuard` | Endpoint must only be reachable in local dev (blocked when `CF_TEAM_DOMAIN` is set or `NODE_ENV !== 'development'`) |

Endpoints with no guard are **public** — no auth checked at all (e.g. `GET /health`).

### Applying guards

At controller level (all methods):
```typescript
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController { ... }
```

At method level (one method only):
```typescript
@Controller('matches')
export class MatchesController {
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getMatch(@Req() req: Request) { ... }
}
```

### Accessing identity in handlers

After `JwtAuthGuard` passes, the decoded JWT payload is on `req.user`.

---

## Error Handling

Always throw NestJS HTTP exceptions from `@nestjs/common`. Never throw raw `Error`.

| Situation | Exception |
|-----------|-----------|
| Resource not found | `NotFoundException` |
| Invalid input / bad move | `BadRequestException` |
| Authenticated but not allowed | `ForbiddenException` |
| Not authenticated | `UnauthorizedException` (guards do this automatically) |
| Conflict (e.g. already joined) | `ConflictException` |

```typescript
import { NotFoundException, BadRequestException } from '@nestjs/common';

// ✓
if (!match) throw new NotFoundException('Match not found');

// ✗ — never do this
if (!match) throw new Error('Match not found');
```

### Game plugin errors

`applyAction()` throws a plain `Error` when a move is invalid. Catch it at the service boundary and rethrow as `BadRequestException`:

```typescript
try {
  newState = plugin.applyAction(state, action, playerIndex);
} catch (e) {
  throw new BadRequestException((e as Error).message);
}
```

### Error response shape

`ValidationPipe` and NestJS exceptions produce:
```json
{ "error": "string description", "code": "MACHINE_READABLE_CODE" }
```

`code` values are defined per feature as they are implemented — add them to `docs/api-reference.md` alongside the endpoint.

---

## DTOs & Validation

`ValidationPipe` is registered globally in `app.ts` with:
- `whitelist: true` — strips any property not declared on the DTO
- `forbidNonWhitelisted: true` — rejects requests that send undeclared properties

**Every request body must be a DTO class** with `class-validator` decorators. Inline types on `@Body()` bypass validation entirely.

```typescript
// ✗ bypasses validation
createMatch(@Body() body: { gameSlug: string }) { ... }

// ✓ validated and stripped
createMatch(@Body() dto: CreateMatchDto) { ... }
```

**DTO conventions:**

- File naming: `<action>-<resource>.dto.ts` — e.g. `create-match.dto.ts`, `submit-move.dto.ts`
- Location: same directory as the controller that uses it
- Use `class-validator` decorators: `@IsString()`, `@IsUUID()`, `@IsIn([...])`, `@IsNotEmpty()`

```typescript
// modules/matches/create-match.dto.ts
import { IsString, IsIn } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  gameSlug: string;

  @IsIn(['human', 'ai'])
  opponentType: 'human' | 'ai';
}
```

---

## Module Communication

- **Never** import another module's `.entity.ts` directly. Call its exported service instead. Exception: TypeORM `@ManyToOne` relationships require the entity class reference — cross-module entity imports are acceptable in `.entity.ts` files only, not in services.
- **Export** a provider only if another module needs to inject it. Default: don't export.
- **Import `AuthModule`** in any module whose controller needs guards — `AuthModule` exports all four guards and `JwtModule`.

```typescript
// ✓ matches.module.ts imports GamesModule to use GamesRegistry
@Module({
  imports: [GamesModule],
  ...
})
export class MatchesModule {}
```

If two modules need each other (circular dependency), extract the shared logic into a third module and have both import that instead.

---

## BullMQ Jobs

Queues are registered in `worker.module.ts`: `notifications` (short-delay move notifications), `reminders` (delayed turn reminders), and `cleanup` (repeatable).

### Enqueueing from a service

Inject the queue with `@InjectQueue`:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationsService {
  constructor(@InjectQueue('reminders') private remindersQueue: Queue) {}

  async scheduleReminder(matchId: string, playerId: string, delayMs: number) {
    const jobId = `reminder:${matchId}:${playerId}`;
    await this.remindersQueue.add('reminder', { matchId, playerId }, {
      delay: delayMs,
      jobId,          // deterministic ID enables cancellation
    });
  }

  async cancelReminder(matchId: string, playerId: string) {
    const jobId = `reminder:${matchId}:${playerId}`;
    await this.remindersQueue.remove(jobId);
  }
}
```

The module that injects a queue must also register it:
```typescript
@Module({
  imports: [BullModule.registerQueue({ name: 'reminders' })],
  ...
})
```

### Processor rules

- `process()` **must be idempotent** — BullMQ retries on throw, so duplicate execution must be safe.
- Check whether the job is still relevant at the start of `process()` (e.g. match may have been completed since the job was enqueued).
- Throw only for genuinely retriable failures (e.g. DB connection error). For expected no-ops (match already done), return silently.

---

## Testing

```bash
cd server
npm test              # run all unit tests once
npm run test:cov      # with coverage report
npm run test:watch    # watch mode during development
```

Import test utilities from `src/common/test/helpers.ts`.

### Service tests

Mock the TypeORM repository with `mockRepository<Entity>()`. Provide it via `getRepositoryToken`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { mockRepository } from '../../common/test/helpers';

const repo = mockRepository<Match>();
const module = await Test.createTestingModule({
  providers: [
    MatchesService,
    { provide: getRepositoryToken(Match), useValue: repo },
    { provide: GamesRegistry, useValue: { get: jest.fn() } },
  ],
}).compile();
```

Mock other injected services inline — only stub the methods your unit under test actually calls:

```typescript
const usersService = { findById: jest.fn(), findOrCreate: jest.fn() };
```

### Guard tests

Build a minimal `ExecutionContext` with `mockHttpContext(req)`:

```typescript
import { mockHttpContext } from '../../../common/test/helpers';

const ctx = mockHttpContext({ headers: { authorization: 'Bearer <token>' } });
guard.canActivate(ctx); // assert return value or thrown exception
```

---

## Entity & Migration Conventions

`app.data.ts` auto-loads all files matching `**/*.entity{.ts,.js}`. The `*.entity.ts` suffix is **required** — files with any other name are silently ignored.

- File naming: `<resource>.entity.ts` in the module directory that owns the table
- Class naming: `PascalCase` matching the table concept — e.g. `MatchPlayer`, `RivalStat`
- Migration naming: describe what changed — e.g. `AddRivalStatsIndex`, `CreateInitialSchema`, `AddRemoteVersionToGames`.

---

## Database Migrations

All commands must be run from the `server/` directory. Use the form `npm run typeorm <subcommand> -- <args>` — placing the subcommand before `--` is required for arguments to pass correctly.

### Normal run (incremental migration)

```bash
# Generate a new migration — diffs entities against the current running DB schema
npm run typeorm migration:generate -- src/migrations/<MigrationName> -d src/app.data.ts

# Review the generated SQL before committing

# Run pending migrations
npm run typeorm migration:run -- -d src/app.data.ts

# Revert the last migration
npm run typeorm migration:revert -- -d src/app.data.ts
```


### Wipe and reinitialise (local dev only)

Use when you want a single clean migration instead of accumulated incremental ones:

```bash
# 1. Wipe the local DB (run from repo root)
docker exec a-couple-of-gamers-db-1 psql -U postgres -d acog -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 2. Delete all existing migration files (run from repo root)
rm server/src/migrations/*.ts

# 3. Generate a fresh migration from current entities (run from server/)
npm run typeorm migration:generate -- src/migrations/CreateInitialSchema -d src/app.data.ts

# 4. Run it
npm run typeorm migration:run -- -d src/app.data.ts
```

> **Never do this on staging or production.** Use incremental migrations for any schema change after the first deploy.

---

## Adding a Module

```bash
# From server/
nest g module  modules/<name>
nest g controller modules/<name> --no-spec   # omit if no REST endpoints
nest g service    modules/<name> --no-spec   # omit if no service layer
```

After generation:

1. **Register in `app.module.ts`** — add to the `imports` array.
2. **Add entities** if the module owns DB tables — see [Adding an Entity](#adding-an-entity).
3. **Add guards** if endpoints require auth — import `AuthModule` and apply `JwtAuthGuard`, `AdminAuthGuard`, or `DevAuthGuard` from `modules/auth/guards/`.
4. **Export services** that other modules will inject — add to the `exports` array in the module decorator.

---

## Adding an Entity

Entities live co-located with the module that owns their table. `app.data.ts` scans `**/*.entity{.ts,.js}` automatically — no registration needed.

```
modules/users/
├── user.entity.ts
modules/games/
├── game.entity.ts
modules/matches/
├── match.entity.ts
modules/config/
├── config.entity.ts
```

If module A needs to query module B's entity, import module B and call its service — no direct cross-module entity references.

After adding, removing, or updating an entity, generate a migration:

```bash
cd server
npx typeorm migration:generate src/migrations/<MigrationName> -d src/app.data.ts
```

Review the generated SQL before committing — TypeORM's diff is usually correct but always worth a check.

---

## Adding a New Game

1. Create the game plugin in `server/src/logic/<slug>/` implementing the `GamePlugin` interface
2. Register the slug in `GamesRegistry` (`server/src/modules/games/games.registry.ts`) — a row is auto-created in the `games` table (`status = 1` / coming_soon) on next server start
3. Add the slug + metadata (display name, icons, banners, intro/rule images) to the client catalog so the tile renders
4. Import the plugin in the Godot client's game loader
5. Create the Godot scene, assets and logic under `client/games/<slug>/` (this is the Asset Bundle)
6. CI will build and upload the bundle to R2 on the next `main` merge or `client/res/games/**` change, and publish a new `game-bundles/<env>/manifest.json` carrying the new slug's bundle version + URL
7. Activate the game via admin — set `status = 2` (enabled) via `PUT /v1/admin/games/<slug>/status` once the bundle is live

---

## Feature Implementation Checklist

Steps for implementing any feature end-to-end, in order:

1. **Read ** understand the design before touching code
2. **Entities** — add `*.entity.ts` files in the owning module, then generate a migration
3. **Service** — implement the business logic; throw NestJS HTTP exceptions for all error cases
4. **DTO** — add a `<action>-<resource>.dto.ts` for every request body
5. **Controller** — wire the endpoint with the correct `@UseGuards()` decorator
6. **Tests** — write `*.spec.ts` for the service; cover the main path and key error cases
7. **Docs** — update `docs/api-reference.md` for new/changed endpoints; update `docs/database-schema.md` for new/changed tables; update `docs/structure.md` if new files were added

---

## PR Checklist

Before requesting review:

- [ ] All new endpoints have a guard (or are intentionally public — leave a comment)
- [ ] All request bodies use a DTO with `class-validator` decorators
- [ ] New or changed service methods have unit tests
- [ ] `docs/api-reference.md` updated for any endpoint additions or changes
- [ ] Feature doc `## Tasks` section updated
- [ ] `docs/structure.md` updated if new files or directories were added
- [ ] Migration generated and SQL reviewed if schema changed
- [ ] No `throw new Error(...)` — only NestJS HTTP exceptions in service/controller code
