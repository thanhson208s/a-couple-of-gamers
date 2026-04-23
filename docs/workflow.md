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

Types: 
  | feat: Adding new feature
  | fix: Patching a bug or error
  | refactor: Code change that neither a fix or feat
  | docs: Changing only documentations
  | test: Adding missing tests or correcting existing tests
  | chore: routine tasks, maintenance, tooling changes
Scope: server | client | infra | db (optional)

Examples:
  feat(server): add WS presence tracking per match
  fix(client): correct lobby badge count on resume
  docs: add match-lifecycle feature doc
  chore(db): add migration for rival_stats index
```

---

## Database Migrations

### Normal run (migration files already exist)

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

Migrations run automatically on deploy (step 4 of CI/CD). See [infrastructure.md#cicd](infrastructure.md#cicd).

### Wipe and reinitialise (local dev only)

Use this when entities changed significantly and you want a clean slate instead of an incremental migration:

**If using Docker Compose for Postgres:**
```bash
docker exec a-couple-of-gamers-db-1 psql -U postgres -d acog -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

> Connect to the `postgres` default database (not `acog`) to drop/recreate it.

```bash
# Generate a new migration then apply it
npm run typeorm -- migration:generate src/migrations/<MigrationName> -d src/app.data.ts
npm run typeorm -w server -- migration:run -d src/app.data.ts
```

> **Never do this on staging or production.** Use incremental migrations (`migration:generate`) for any schema change after the first deploy.

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

After adding, removing or updating an entity, generate a migration:

```bash
cd server
npx typeorm migration:generate src/migrations/<MigrationName> -d src/app.data.ts
```

Review the generated SQL before committing — TypeORM's diff is usually correct but always worth a check.

See migration naming rules: [convetions.md — Entity & Migration Conventions](conventions.md#entity-&-migration-conventions)

---

## Adding a New Game

1. Create the shared game plugin in `packages/game-logic/<slug>/` implementing the `GamePlugin` interface — see [game-system.md](game-system.md)
2. Register the slug in `GamesRegistry` (`server/src/modules/games/games.registry.ts`) — a row is auto-created in the `games` table (`status = 1` / coming_soon) on next server start
3. Add the slug + metadata (display name, icons, banners, intro/rule images) to the client catalog so the tile renders (ships via the next main-app hot update — see [hot-update.md](hot-update.md))
4. Import the plugin in the Cocos client's game loader
5. Create the Cocos Creator scene and assets under `client/res/games/<slug>/` (this is the Asset Bundle)
6. Create the AI component at `client/src/games/<slug>/AiPlayer.ts` (imports from `packages/game-logic/<slug>/`)
7. CI will build and upload the bundle to R2 on the next `dev` merge or `client/res/games/**` change, and publish a new `game-bundles/<env>/manifest.json` carrying the new slug's bundle version + URL
8. Activate the game via admin — set `status = 2` (enabled) via `PUT /v1/admin/games/<slug>/status` once the bundle is live

---

## Publishing a Hot Update

Hot updates are automatic — no manual step needed. Any merge to `dev` or push of a `v*` tag triggers the Cocos asset publish job, which builds the main bundle, generates the version diff, and uploads to R2.

Content is published to **per-platform, per-minor-version tracks** under `hot-update/<env>/<platform>/apk-<major.minor>/`. The target minor per platform is declared in the client's `version.manifest` under a `nativeVersion` block — CI reads it, templates each track's URL fields, and uploads to both platform tracks. See [hot-update.md#ci-pipeline](hot-update.md#ci-pipeline) and [infrastructure.md#cicd](infrastructure.md#cicd).

Bumping `nativeVersion.<platform>` in `version.manifest` creates a new track on next publish. Do this deliberately — a bump signals that the bundle now relies on native features only present in that platform minor. The full release sequence (track bump → store submission → admin config) is covered in [Releasing a Native Build](#releasing-a-native-build) below.

---

## Releasing a Native Build

A new APK/IPA release spans the repo, the app stores, and the server admin config. Follow this sequence — bumping config out of order prompts users to update to a build the store hasn't released, or silently stalls rollout.

1. **Publish the new track.** Bump `nativeVersion.<platform>` in the Cocos project's `version.manifest` and merge. CI uploads the first bundle of the new track to R2. Must happen **before** step 2 so fresh installs of the new native build don't hit a 404 on first manifest fetch. (Cocos falls back to the APK-embedded bundle, so this is a freshness issue rather than a hard failure — but worth avoiding.)
2. **Submit the native build** to App Store / Play Store. Wait for store review and rollout.
3. **Bump `latestVersion`.** Once the new build is live in the store, update `appVersion.<platform>.latestVersion` in `/v1/config` via the admin dashboard. This is the trigger for the soft "update available" banner on outdated-but-supported clients.

**Retiring an old minor** — separate, later admin action:

4. When enough users have moved off an old minor, bump `appVersion.<platform>.minSupportedVersion` past that minor in `/v1/config`. Clients still on the retired minor see the hard-block update screen on their next launch.
5. The next weekly run of the hot-update prune workflow deletes the retired track's assets from R2. Run the workflow manually with `dry_run=true` first if you want to preview the deletion.

Both admin writes trigger the existing Cloudflare purge on `/v1/config` — clients see the change on their next launch.

---

## Publishing a Game Bundle

Every push to `client/res/games/**` on `dev` or `main` triggers a **whole-bundle publish** for that environment. CI rebuilds every slug, content-hashes each source directory, and emits a single authoritative manifest. The job carries `concurrency: { group: bundle-publish-${env}, cancel-in-progress: true }` so overlapping commits don't race — the latest run writes the manifest.

Steps (in order):

1. **Build** every `client/res/games/<slug>/`; compute `<hash>` per slug from the source directory.
2. **Upload (skip-if-exists)** each bundle to `game-bundles/<env>/<slug>/<hash>/`. Matching hash already on R2 → no-op.
3. **Compose manifest** in memory from the build output — per-slug `{ version: <hash>, url: <versioned-url> }`.
4. **`PUT` manifest.json** to `game-bundles/<env>/manifest.json`. This single atomic object write is the transaction — either clients see the new manifest or the old one, never a partial mix.
5. **Prune** — list each `game-bundles/<env>/<slug>/*/` and delete every `<version>/` folder not referenced in the new manifest.

CI never writes to Postgres. If step 2 or 4 fails, the manifest is unchanged and retries are always safe — previous bundle URLs still resolve to intact, immutable content. If step 5 fails, the manifest is already correct; orphan folders get cleaned on the next successful publish. See [hot-update.md#source-of-truth](hot-update.md#source-of-truth) for the full rationale.

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

All secrets and config live in `.env.<environment>` files (never committed). Copy `.env.example` to get started. Full list and descriptions: [infrastructure.md#secrets--environment](infrastructure.md#secrets--environment).

---

## Testing

```bash
cd server
npm test              # run all unit tests once
npm run test:cov      # with coverage report
npm run test:watch    # watch mode during development
```

→ File naming convention, what to test per layer, and test helper usage: [conventions.md — Testing](conventions.md#testing)

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
