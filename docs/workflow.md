# Workflow

Branching strategy, conventional commit format, DB migration commands, VPS access via Oracle Bastion, steps for adding a new game, and environment variable reference.

→ Local dev setup and environment provisioning: [setup.md](setup.md)  
→ Code conventions (guards, errors, DTOs, modules, BullMQ, entities): [conventions.md](conventions.md)

---

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code. Only receives merges from tagged releases. |
| `dev` | Integration branch. All feature branches merge here. Auto-deploys to staging. |
| `feature/<name>` | Individual feature or fix branches. Branch from `dev`, PR back to `dev`. |

Tag format for releases: `v<major>.<minor>.<patch>` (e.g. `v1.0.0`). Pushing a tag triggers the production deploy pipeline.

---

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

Types: feat | fix | refactor | docs | test | chore
Scope: server | client | infra | db (optional)

Examples:
  feat(server): add WS presence tracking per match
  fix(client): correct lobby badge count on resume
  docs: add match-lifecycle feature doc
  chore(db): add migration for rival_stats index
```

---

## Database Migrations

```bash
# Generate a new migration (from server/ directory)
# Requires the local DB to be running — TypeORM diffs entities against the current schema
npm run typeorm -- migration:generate src/migrations/<MigrationName> -d src/app.data.ts

# Review the generated SQL before committing

# Run pending migrations manually (local)
npm run typeorm -- migration:run -d src/app.data.ts

# Revert the last migration
npm run typeorm -- migration:revert -d src/app.data.ts
```

Migrations run automatically on deploy (step 4 of CI/CD). See [infrastructure.md#database-migrations](infrastructure.md#database-migrations).

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
3. **Add guards** if endpoints require auth — import `AuthModule` and apply `JwtAuthGuard`, `GuestAuthGuard`, `AdminAuthGuard`, or `DevAuthGuard` from `modules/auth/guards/`.
4. **Export services** that other modules will inject — add to the `exports` array in the module decorator.
5. **Update `docs/structure.md`** — add the new module to the server modules table.
6. **Add a feature doc** if the module implements a user-facing feature — create `docs/features/<name>.md` following the template in `docs/features/README.md` and link it from `docs/requirements.md`.

---

## Adding an Entity

Entities live co-located with the module that owns their table. `app.data.ts` scans `**/*.entity{.ts,.js}` automatically — no registration needed.

```
modules/users/
├── user.entity.ts          # users
modules/games/
├── game.entity.ts          # games
modules/matches/
├── match.entity.ts         # matches (includes embedded player identity)
├── move.entity.ts          # moves
modules/config/
├── config.entity.ts    # config
```

If module A needs to query module B's entity, import module B and call its service — no direct cross-module entity references.

After adding an entity, generate a migration:

```bash
cd server
npx typeorm migration:generate src/migrations/<MigrationName> -d src/app.data.ts
```

---

## Adding a New Game

1. Create the shared game plugin in `packages/game-logic/<slug>/` implementing the `GamePlugin` interface — see [game-system.md](game-system.md)
2. Import and register the plugin in `GamesModule` (server) and in the Cocos client's game loader
3. Create the Cocos Creator scene and assets under `client/games/<slug>/` (this is the Asset Bundle)
4. Create the AI component at `client/games/<slug>/AiPlayer.ts` (imports from `packages/game-logic/<slug>/`)
5. Insert a row into the `games` table via migration (set `is_preinstalled` or leave `bundle_url` for CI to populate)
6. Add the game to the catalog table in [game-system.md#game-catalog](game-system.md#game-catalog)
7. CI will build and upload the bundle to R2 on the next `dev` merge or `client/games/<slug>/` change

---

## Publishing a Hot Update

Hot updates are automatic — no manual step needed. Any merge to `dev` or push of a `v*` tag triggers the Cocos asset publish job, which builds the main bundle, generates the version diff, and uploads to R2. See [infrastructure.md#cicd](infrastructure.md#cicd).

---

## Publishing a Mini Game Bundle

Pushing changes to `client/games/<slug>/` on `dev` or `main` triggers a bundle-only publish for that game. CI builds the bundle and uploads to `game-bundles/<env>/<slug>/`. After the upload, bump `bundle_version` in the `games` table row for that slug (via a migration or direct update on the target environment).

---

## Connecting to a VPS

Access to all VPS instances goes through Oracle Cloud Bastion (managed SSH sessions). No VPS has a publicly exposed SSH port.

### 1. Generate an SSH key pair (first time only)

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
# Default output: ~/.ssh/id_ed25519 (private) and ~/.ssh/id_ed25519.pub (public)
```

Keep the private key local and never commit it.

### 2. Create a Bastion session

In the Oracle Cloud Console:
1. Navigate to **Bastion** → select the bastion for the target VPS
2. Click **Create session** → choose **Managed SSH session**
3. Set **Username** to `opc`
4. Paste the contents of your `~/.ssh/id_ed25519.pub` into the **SSH public key** field
5. Select the target VPS instance and click **Create session**

### 3. Connect

Once the session is active, copy the SSH command from the session details and run it locally, pointing to your private key:

```bash
ssh -i ~/.ssh/id_ed25519 -o ProxyCommand='...' opc@<instance-ip>
# Use the exact command shown in the Oracle Console — it includes the proxy args for Bastion
```

Sessions expire after a set TTL (configurable in Bastion settings). Create a new session when the current one expires.

---

## Environment Variables

All secrets and config live in `.env.<environment>` files (never committed). Copy `.env.example` to get started. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | Signing key for access tokens (min 256-bit) |
| `JWT_REFRESH_SECRET` | Signing key for refresh tokens (separate from access) |
| `FCM_SERVICE_ACCOUNT` | Firebase service account JSON (stringified) |
| `SENTRY_DSN` | Sentry project DSN for server |
| `DEV_MODE` | Set to `true` to enable dev-only endpoints (password-less login, cheats). **Never set in staging or production.** |

Full list in `.env.example`.

---

## Testing

```bash
cd server
npm test              # run all unit tests once
npm run test:cov      # with coverage report
npm run test:watch    # watch mode during development
```

### File naming

Test files live alongside the file they test and must end in `.spec.ts`:

```
modules/matches/
├── matches.service.ts
├── matches.service.spec.ts   ← unit tests for the service
```

### What to test per layer

**Services** — the core logic layer. Mock all dependencies (repositories, other services, queues):

```typescript
const module = await Test.createTestingModule({
  providers: [
    MatchesService,
    { provide: getRepositoryToken(Match), useValue: mockRepository() },
    { provide: PluginRegistry, useValue: { get: jest.fn() } },
  ],
}).compile();
```

**Guards** — test `canActivate()` with mock `ExecutionContext`. Confirm it returns `true` on valid input and throws on invalid.

**Controllers** — only if the controller has non-trivial logic (rare). Use `@nestjs/testing` `Test.createTestingModule` with a mocked service.

Processors and gateways are tested via integration tests (out of scope until the project has an integration test setup).

---

## Feature Implementation Checklist

Steps for implementing any feature end-to-end, in order:

1. **Read** `docs/features/<name>.md` — understand the design before touching code
2. **Entities** — add `*.entity.ts` files in the owning module, then generate a migration
3. **Service** — implement the business logic; throw NestJS HTTP exceptions for all error cases
4. **DTO** — add a `<action>-<resource>.dto.ts` for every request body
5. **Controller** — wire the endpoint with the correct `@UseGuards()` decorator
6. **Tests** — write `*.spec.ts` for the service; cover the main path and key error cases
7. **Docs** — update `docs/api-reference.md` for new/changed endpoints; tick off completed tasks in the feature doc's `## Tasks` section; update `docs/structure.md` if new files were added

→ Guard selection and error handling rules: [conventions.md](conventions.md)

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
