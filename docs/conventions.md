# Conventions

Code patterns used throughout the server. Read this before writing any feature code.

---

## Guards & Authentication

Four guards live in `modules/auth/guards/`. All are exported from `AuthModule` — import `AuthModule` in your module to use them.

| Guard | Use when |
|-------|---------|
| `JwtAuthGuard` | Endpoint requires an authenticated user (social or guest JWT) |
| `AdminAuthGuard` | Endpoint is admin-only (`X-Admin-Token` header) |
| `DevAuthGuard` | Endpoint must only be reachable in local dev (blocked when `CF_TEAM_DOMAIN` is set or `DEV_MODE` is unset) |

Endpoints with no guard are **public** — no auth checked at all (e.g. `GET /v1/config`, `GET /health`).

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
After `GuestAuthGuard` passes, the guest UUID is on `req.guestId`.

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

`applyMove()` throws a plain `Error` when a move is invalid. Catch it at the service boundary and rethrow as `BadRequestException`:

```typescript
try {
  newState = plugin.applyMove(state, move, playerId);
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

### DTO conventions

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

Queues are registered in `worker.module.ts`: `reminders` (delayed) and `cleanup` (repeatable).

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
- Always generate migrations via CLI after writing or changing an entity — never hand-write SQL:

```bash
cd server
npx typeorm migration:generate src/migrations/<PascalCaseName> -d src/app.data.ts
```

Migration naming: describe what changed — e.g. `AddRivalStatsIndex`, `CreateInitialSchema`, `AddBundleVersionToGames`.

Review the generated SQL before committing — TypeORM's diff is usually correct but always worth a check.
