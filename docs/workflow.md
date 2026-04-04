# Workflow

Local dev commands, branching strategy, conventional commit format, DB migration commands, VPS access via Oracle Bastion, steps for adding a new game, and environment variable reference.

---

## Local Dev Setup

Prerequisites: Docker, Docker Compose, Cocos Creator, Node.js 20+.

```bash
# 1. Clone repo
git clone <repo-url>
cd a-couple-of-gamers

# 2. Copy env template
cp .env.example .env.local

# 3. Start local services (Postgres + Redis)
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d db cache

# 4. Start NestJS server (watch mode)
cd server
npm install
npm run start:dev

# 5. Open Cocos Creator project
# Open client/ in Cocos Creator
# Set API base URL to http://localhost:3000 in the project config
```

Local Postgres: `localhost:5432`  
Local Redis: `localhost:6379`

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
npx typeorm migration:generate src/migrations/<MigrationName> -d src/data-source.ts

# Review the generated SQL before committing

# Run pending migrations manually (local)
npx typeorm migration:run -d src/data-source.ts

# Revert the last migration
npx typeorm migration:revert -d src/data-source.ts
```

Migrations run automatically on deploy (step 4 of CI/CD). See [infrastructure.md#database-migrations](infrastructure.md#database-migrations).

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

Full list in `.env.example`.
