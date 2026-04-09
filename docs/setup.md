# Setup

---

## Scaffolding

How the project skeleton was created from scratch. Follow these steps to reproduce the current structure or understand why things are laid out the way they are.

→ For file-by-file descriptions of the resulting structure, see [structure.md](structure.md).

---

### 1. Monorepo root

Create the root `package.json` to wire all workspaces under one `npm install`:

```json
{
  "name": "a-couple-of-gamers",
  "private": true,
  "workspaces": [
    "server",
    "packages/game-logic",
    "packages/game-logic/tictactoe"
  ]
}
```

Each workspace entry maps to a directory with its own `package.json`. npm hoists shared deps into `node_modules/` at the root.

**Verify:** `npm install` at the root installs deps for all three workspaces in one pass.

---

### 2. Shared package — `@acog/game-logic`

This package defines the `GamePlugin` interface consumed by both the server (move validation) and the client (offline AI). It has no runtime deps — types only.

```bash
mkdir -p packages/game-logic/src
```

**`packages/game-logic/package.json`**
```json
{
  "name": "@acog/game-logic",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**`packages/game-logic/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**`packages/game-logic/src/interface.ts`** — the `GamePlugin` contract:
```typescript
export interface GameState { [key: string]: unknown; }
export interface Move      { [key: string]: unknown; }
export interface PlayerView{ [key: string]: unknown; }

export interface GamePlugin {
  initialState(playerIds: string[]): GameState;
  applyMove(state: GameState, move: Move, playerId: string): GameState;
  getPlayerView(state: GameState, playerId: string): PlayerView;
  isGameOver(state: GameState): boolean;
  getWinner(state: GameState): string | null;
}
```

**`packages/game-logic/src/index.ts`**
```typescript
export type { GamePlugin, GameState, Move, PlayerView } from './interface';
```

**Verify:** `npm run build --workspace=packages/game-logic` produces `packages/game-logic/dist/`.

---

### 3. Shared package — `@acog/game-logic-tictactoe`

The first game plugin. Implements `GamePlugin` as a stub — structure is wired, logic is not yet written. Kept as a separate workspace so it can be imported by both server and client independently.

```bash
mkdir -p packages/game-logic/tictactoe/src
```

**`packages/game-logic/tictactoe/package.json`**
```json
{
  "name": "@acog/game-logic-tictactoe",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch"
  },
  "dependencies": {
    "@acog/game-logic": "*"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

`"@acog/game-logic": "*"` resolves to the local workspace package via npm workspaces — no registry lookup.

**`packages/game-logic/tictactoe/tsconfig.json`** — identical to the base package tsconfig.

**`packages/game-logic/tictactoe/src/index.ts`** — stub class:
```typescript
import type { GamePlugin, GameState, Move, PlayerView } from '@acog/game-logic';

export class TicTacToePlugin implements GamePlugin {
  initialState(_playerIds: string[]): GameState {
    throw new Error('not implemented');
  }
  applyMove(_state: GameState, _move: Move, _playerId: string): GameState {
    throw new Error('not implemented');
  }
  getPlayerView(state: GameState, _playerId: string): PlayerView {
    return state as PlayerView; // open-information game
  }
  isGameOver(_state: GameState): boolean {
    throw new Error('not implemented');
  }
  getWinner(_state: GameState): string | null {
    throw new Error('not implemented');
  }
}
```

**Verify:** `npm run build --workspace=packages/game-logic/tictactoe` produces `packages/game-logic/tictactoe/dist/`.

---

### 4. Server — bootstrap

Use the NestJS CLI to generate the project skeleton, then move it into `server/`:

```bash
npx @nestjs/cli new server --package-manager npm --skip-git
```

This creates `server/` with `src/app.module.ts`, `src/main.ts`, `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, and `Dockerfile`.

Rename entry points to match the `app.*` naming convention:
```bash
mv server/src/main.ts         server/src/app.ts
mv server/src/app.controller.ts  server/src/app.health.ts   # repurposed as health check
```

Delete the CLI-generated boilerplate that won't be used:
```bash
rm server/src/app.controller.spec.ts
rm server/src/app.service.ts
```

---

### 5. Server — dependencies

Install all runtime deps from `server/`:

```bash
cd server
npm install \
  @nestjs/bullmq @nestjs/jwt @nestjs/typeorm @nestjs/websockets @nestjs/platform-ws \
  @nestjs/serve-static \
  bullmq ioredis pg typeorm \
  firebase-admin \
  @sentry/node \
  class-validator class-transformer \
  ws
```

`@acog/game-logic` and `@acog/game-logic-tictactoe` are resolved from the monorepo workspaces — add them to `server/package.json` manually:
```json
"dependencies": {
  "@acog/game-logic": "*",
  ...
}
```

---

### 6. Server — configuration files

**`server/tsconfig.json`** — NestJS requires `emitDecoratorMetadata` and `experimentalDecorators` for dependency injection:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true
  }
}
```

**`server/tsconfig.build.json`** — extends base, excludes test files from the production build:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

**`server/nest-cli.json`** — points the CLI at `src/` and uses `tsconfig.build.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.build.json"
  }
}
```

---

### 7. Server — entry points

**`server/src/app.ts`** — API bootstrap:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

**`server/src/worker.ts`** — BullMQ worker bootstrap (no HTTP listener):
```typescript
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  await app.init();
}
bootstrap();
```

**`server/src/app.health.ts`** — health check controller:
```typescript
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppHealth {
  @Get('health')
  health() {
    return { status: 'ok', db: 'ok', cache: 'ok' };
  }
}
```

**`server/src/app.data.ts`** — TypeORM DataSource for CLI migrations (`synchronize: false` always):
```typescript
import { DataSource } from 'typeorm';

export const AppData = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
```

**`server/src/app.module.ts`** — root module, wires TypeORM and all feature modules:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GamesModule } from './modules/games/games.module';
import { MatchesModule } from './modules/matches/matches.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ConfigModule } from './modules/config/config.module';
import { AdminModule } from './modules/admin/admin.module';
import { WsModule } from './modules/ws/ws.module';
import { AppHealth } from './app.health';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false,
      autoLoadEntities: true,
    }),
    AuthModule, UsersModule, GamesModule, MatchesModule,
    NotificationsModule, ConfigModule, AdminModule, WsModule,
  ],
  controllers: [AppHealth],
})
export class AppModule {}
```

---

### 8. Server — feature modules

Generate all eight modules with the NestJS CLI from `server/`:

```bash
# Modules with controller + service
nest g module  modules/auth
nest g controller modules/auth --no-spec
nest g service    modules/auth --no-spec

nest g module  modules/users
nest g controller modules/users --no-spec
nest g service    modules/users --no-spec

nest g module  modules/games
nest g controller modules/games --no-spec
nest g service    modules/games --no-spec

nest g module  modules/matches
nest g controller modules/matches --no-spec
nest g service    modules/matches --no-spec

nest g module  modules/config
nest g controller modules/config --no-spec
nest g service    modules/config --no-spec

nest g module  modules/admin
nest g controller modules/admin --no-spec

# Service-only (no HTTP controller)
nest g module  modules/notifications
nest g service    modules/notifications --no-spec

# Gateway module (WebSocket, no REST controller)
nest g module  modules/ws
```

After generation, apply these manual changes:

**`modules/auth/`** — add `guards/` subdirectory with four guards:
```
guards/admin-auth.guard.ts    # checks X-Admin-Token header
guards/jwt-auth.guard.ts      # verifies Bearer token, attaches req.user
guards/guest-auth.guard.ts    # requires X-Guest-Id header, attaches req.guestId
guards/dev-auth.guard.ts      # returns 404 outside local dev
```
Register `JwtModule` in `auth.module.ts` and export all guards — see [structure.md#auth](structure.md#auth) for full module definition.

**`modules/games/`** — add `plugin.registry.ts` alongside the service:
```typescript
@Injectable()
export class PluginRegistry {
  private readonly plugins = new Map<string, GamePlugin>([
    ['tictactoe', new TicTacToePlugin()],
  ]);

  get(slug: string): GamePlugin {
    const plugin = this.plugins.get(slug);
    if (!plugin) throw new Error(`No plugin registered for game: ${slug}`);
    return plugin;
  }
}
```

**`modules/ws/`** — add `ws.gateway.ts` (NestJS WebSocketGateway, not a REST controller):
```bash
nest g gateway modules/ws/ws --no-spec
```

**`modules/admin/`** — imports `AuthModule` (for `AdminAuthGuard`) and `ConfigModule`; also registers `ServeStaticModule` to serve `public/admin/` at `/admin`.

---

### 9. Server — worker

The worker runs as a separate NestJS application context sharing the same codebase. Create its module and processors manually (no CLI generator for BullMQ processors):

```bash
mkdir -p server/src/worker/processors
```

**`server/src/worker/worker.module.ts`** — registers two BullMQ queues:
```typescript
@Module({
  imports: [
    BullModule.forRoot({ connection: { url: process.env.REDIS_URL } }),
    BullModule.registerQueue({ name: 'reminders' }, { name: 'cleanup' }),
  ],
  providers: [ReminderProcessor, CleanupProcessor],
})
export class WorkerModule {}
```

**`server/src/worker/processors/cleanup.processor.ts`** and **`reminder.processor.ts`** — stub `@Processor` classes decorated with `@nestjs/bullmq`.

---

### 10. Server — migrations directory

TypeORM requires the migrations directory to exist, even if empty:

```bash
mkdir server/src/migrations
touch server/src/migrations/.gitkeep
```

The first real migration is generated once entities exist:
```bash
cd server
npx typeorm migration:generate src/migrations/InitialSchema -d src/app.data.ts
```

---

### 11. Docker Compose files

Five Compose files live at the repo root. Start from the base and layer environment-specific overrides:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base service definitions (`app`, `worker`, `db`, `cache`, `proxy`) with image names and restart policies |
| `docker-compose.local.yml` | Exposes `db:5432` and `cache:6379`; disables `app`, `worker`, `proxy` |
| `docker-compose.staging.yml` | All services on one host; mounts `Caddyfile.staging`; named volumes for DB and Caddy data |
| `docker-compose.prod-app.yml` | `app` + `worker` + `proxy` only; disables `db` and `cache` (they run on prod-data) |
| `docker-compose.prod-data.yml` | `db` + `cache` only with named volumes and Redis password; disables app-side services |

See [infrastructure.md#docker-compose](infrastructure.md#docker-compose) for the service topology rationale.

---

### 12. Client — not yet scaffolded

The Cocos Creator project has not been initialized. `client/games/` exists as a placeholder only.

When scaffolding the client:
1. Open Cocos Creator → **New Project** → select `client/` as the project path, choose the 2D template
2. Commit the generated project files (`.gitignore` the `temp/` and `local/` directories)
3. Install the Firebase SDK plugin from the Cocos Store or as a package
4. Place `GoogleService-Info.plist` (iOS) and `google-services.json` (Android) from [setup.md#6c-client-sdk-config](#6c-client-sdk-config) into the platform directories
5. Set the API base URL constant to `http://localhost:3000` for local, overridden per build target in CI

Each game then follows the steps in [workflow.md — Adding a New Game](workflow.md#adding-a-new-game).

---

## Local Dev Setup

### 1. Prerequisites

Install before continuing:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org or `nvm install 20` |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop |
| Cocos Creator | 3.x (match project version) | https://www.cocos.com/creator |

Verify:
```bash
node -v        # v20.x.x
docker -v      # Docker version 24+
docker compose version  # v2.x.x (plugin, not standalone)
```

---

### 2. Clone and install

```bash
git clone <repo-url>
cd a-couple-of-gamers
npm install        # installs all workspace deps: server + packages/game-logic + packages/game-logic/tictactoe
```

`npm install` at the repo root covers all workspaces. No need to `cd server && npm install` separately.

**Verify:** `ls server/node_modules/@nestjs` lists NestJS packages.

---

### 3. Build shared packages

The server imports `@acog/game-logic` from `packages/`. Build it before starting the server:

```bash
npm run build --workspace=packages/game-logic
npm run build --workspace=packages/game-logic/tictactoe
```

**Verify:** `packages/game-logic/dist/` and `packages/game-logic/tictactoe/dist/` exist.

---

### 4. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with local values:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/acog
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=local-dev-access-secret-change-in-prod
JWT_REFRESH_SECRET=local-dev-refresh-secret-change-in-prod
FIREBASE_PROJECT_ID=           # leave empty unless testing Firebase auth locally
FCM_SERVICE_ACCOUNT={}         # leave empty unless testing push notifications locally
SENTRY_DSN=                    # leave empty locally
ADMIN_TOKEN=local-admin-token
PORT=3000
NODE_ENV=development
DEV_MODE=true
```

The Postgres credentials match `docker-compose.local.yml` (`postgres:postgres`). Redis runs without a password locally.

---

### 5. Start infrastructure

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

This starts Postgres (`:5432`), Redis (`:6379`), pgAdmin (`:5050`), and RedisInsight (`:5540`). The NestJS app and Caddy are disabled in the local override.

**Verify:**
```bash
docker compose ps        # db, cache, pgadmin, redisinsight show "running"
docker compose exec db psql -U postgres -c '\l'   # lists databases including "acog"
```

---

### 5a. Stop infrastructure

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

Stops and removes containers but **preserves the DB volume** — data survives a restart.

---

### 5b. Inspect Postgres and Redis (optional)

Two web UIs are included in the local stack — no extra installs needed.

**pgAdmin** — Postgres web UI at `http://localhost:5050`

1. Log in: email `admin@local.dev`, password `admin`
2. Right-click **Servers → Register → Server**
3. Fill in:
   - Name: `acog-local`
   - Host: `host.docker.internal`, Port: `5432`, Username: `postgres`, Password: `postgres`
4. Expand the server tree to browse tables and run queries

**RedisInsight** — Redis web UI at `http://localhost:5540`

1. Open `http://localhost:5540`
2. Add a new connection: Host `host.docker.internal`, Port `6379` (no password)
3. Browse keys, inspect values, run CLI commands

---

### 6. Run migrations

#### First time (no migration files yet)

Generate the initial migration from entities, then apply it:

```bash
npm run typeorm -w server -- migration:generate server/src/migrations/InitialSchema -d server/src/app.data.ts
npm run typeorm -w server -- migration:run -d server/src/app.data.ts
```

The generated file (e.g. `src/migrations/1234567890-InitialSchema.ts`) must be committed.

#### Normal run (migration files already exist)

```bash
npm run typeorm -w server -- migration:run -d server/src/app.data.ts
```

**Verify:** the command prints `query: SELECT ...` lines and exits with no errors. Re-running is safe — TypeORM skips already-applied migrations.

#### Wipe and reinitialise (local dev only)

Use this when entities changed significantly and you want a clean slate instead of an incremental migration:

**If using Docker Compose for Postgres:**
```bash
docker exec a-couple-of-gamers-db-1 psql -U postgres -d acog -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

**If using a local Postgres installation:**
```bash
psql postgresql://postgres:postgres@localhost:5432/postgres -c "DROP DATABASE acog;"
psql postgresql://postgres:postgres@localhost:5432/postgres -c "CREATE DATABASE acog;"
```
> Connect to the `postgres` default database (not `acog`) to drop/recreate it.

```bash
# Apply the current migration
npm run typeorm -w server -- migration:run -d src/app.data.ts
```

> **Never do this on staging or production.** Use incremental migrations (`migration:generate`) for any schema change after the first deploy.

---

### 7. Start the API server

```bash
npm run start:dev -w server
```

This runs `nest start --watch` — TypeScript is compiled on the fly, server restarts on file changes.

**Verify:** `curl http://localhost:3000/health` returns `{"status":"ok","db":"ok","cache":"ok"}`.

Endpoints are prefixed with `/v1/` (e.g. `GET http://localhost:3000/v1/games`). The `/health` endpoint is the only exception.

---

### 8. Start the worker (optional)

The BullMQ worker processes background jobs (inactive match cleanup, turn reminders). It is not required to run most features, but start it if working on notifications or match cleanup:

```bash
npm run start:worker:dev -w server
```

This runs `ts-node` with the `worker.ts` entry point. No HTTP port — it only connects to Redis and Postgres.

**Verify:** the terminal prints NestJS bootstrap logs and then stays running with no errors.

---

### 9. Open the client (Cocos Creator)

> **Note:** the Cocos Creator project is not yet scaffolded. Skip this step until `client/` contains a Cocos project.

Once scaffolded:
1. Open Cocos Creator → **Open Project** → select `client/`
2. Set the API base URL to `http://localhost:3000` in the project's network config
3. Use the Cocos **Preview** button to run in-browser or on a simulator

---

### Quick-start summary

```bash
# Terminal 1 — infrastructure (db, cache, pgAdmin :5050, RedisInsight :5540)
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d

# Terminal 2 — API server
npm run start:dev -w server

# Terminal 3 — worker (optional)
npm run start:worker:dev -w server
```

All three can be left running. The API server hot-reloads on save; the worker requires a manual restart on change.

---

## Environment Setup

Complete from-scratch provisioning. Follow sections in order — later sections depend on earlier ones.

**Verify as you go:** each section ends with a checkable state.

---

### 1. Oracle Cloud VPS

Provision three VM instances in Oracle Cloud (Always Free tier is sufficient for this scale):

| Instance | Name | Shape | OS |
|----------|------|-------|----|
| prod-app | `acog-prod-app` | VM.Standard.A1.Flex (2 OCPU, 12 GB) | Oracle Linux 9 |
| prod-data | `acog-prod-data` | VM.Standard.A1.Flex (1 OCPU, 6 GB) | Oracle Linux 9 |
| staging | `acog-staging` | VM.Standard.A1.Flex (1 OCPU, 6 GB) | Oracle Linux 9 |

Place all three instances in the same **VCN** and **Availability Domain**. prod-app and prod-data must be in the same subnet (or peered subnets) so they can communicate over the private network.

**Verify:** all three instances show "Running" in the OCI Console. Note the private IP of prod-data — needed for `DATABASE_URL` and `REDIS_URL` on prod-app.

---

### 2. DNS (Cloudflare)

Add the `gootube.online` zone to Cloudflare and enable the DNS proxy:

1. Cloudflare Dashboard → **Add a site** → enter `gootube.online`. Cloudflare scans existing records.
2. At the domain registrar, update nameservers to the two Cloudflare nameservers shown. Wait for propagation.
3. Create DNS A records with the proxy **on** (orange cloud):

| Name | Type | Value | Proxy |
|------|------|-------|-------|
| `acog` | A | prod-app public IP | On |
| `acoq` | A | staging public IP | On |

4. Cloudflare Dashboard → **SSL/TLS → Overview** → set mode to **Full (strict)**.

**Verify:** `dig acog.gootube.online +short` returns a Cloudflare IP (not the VPS IP). After first deploy, `curl -I https://acog.gootube.online/health` includes a `CF-Ray` response header.

---

### 3. Firewall / Ingress Rules

#### VCN Security List

Open the following ingress rules on the VCN security list (or NSG):

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 80 | TCP | Cloudflare CIDRs (cloudflare.com/ips) | HTTP |
| 443 | TCP | Cloudflare CIDRs (cloudflare.com/ips) | HTTPS + WebSocket |
| 22 | TCP | Oracle Bastion CIDR | SSH via Bastion only |

**prod-data only — also open within VCN (private CIDR only):**

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 5432 | TCP | VCN CIDR | Postgres from prod-app |
| 6379 | TCP | VCN CIDR | Redis from prod-app |

#### OS-level firewall (each VPS)

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

**Verify:** `curl -I http://<prod-app-public-ip>` should get a connection (any response, even a reset) — confirms port 80 is reachable.

---

### 4. VPS Bootstrap

Run on **all three** VPS instances:

```bash
# Install Docker
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker opc

# Install Docker Compose plugin
sudo dnf install -y docker-compose-plugin

# Clone repo
sudo mkdir -p /opt/acog
sudo chown opc:opc /opt/acog
git clone <repo-url> /opt/acog
cd /opt/acog
```

Log out and back in so the `docker` group takes effect.

**Verify:** `docker compose version` returns a version string.

---

### 5. GitHub Container Registry (GHCR)

The deploy workflow pushes images to `ghcr.io/<org>/server`. Enable GHCR access:

1. In GitHub → Settings → Developer settings → Personal access tokens (or org-level): create a token with `write:packages` scope.
2. Add as GitHub Actions secret: `REGISTRY_TOKEN` = the token value.
3. The `github.actor` variable in the workflow handles the login username automatically.

**Verify:** after the first deploy workflow run, the package `ghcr.io/<org>/server` appears in the GitHub org's Packages tab.

---

### 6. Firebase

Create one Firebase project (used for all environments; separate apps per environment within the same project).

#### 6a. Authentication

1. Firebase Console → Authentication → Sign-in method → enable **Google**, **Apple**, **Facebook**.
2. For Apple: upload the `.p8` key and fill in Team ID + Key ID (required for APNs).
3. For Facebook: create a Facebook App at developers.facebook.com; copy the App ID and App Secret into Firebase.

#### 6b. Service Account (server-side)

1. Firebase Console → Project settings → Service accounts → Generate new private key.
2. Download the JSON file. Stringify it: `cat serviceAccount.json | jq -c .`
3. Set as `FCM_SERVICE_ACCOUNT` env var on the VPS `.env` files and in GitHub Actions secrets (for CI if needed).

#### 6c. Client SDK Config

1. Firebase Console → Project settings → Your apps → Add app → iOS and Android.
2. Download `GoogleService-Info.plist` (iOS) and `google-services.json` (Android).
3. Place them in the Cocos Creator project under the appropriate platform directories.
4. Set `FIREBASE_PROJECT_ID` in `.env` files.

#### 6d. Firebase Analytics

Analytics is enabled by default when you add the Firebase SDK to the Cocos project. No server-side config needed — events are sent directly from the client.

**Verify:** Firebase Console → Authentication shows the sign-in providers as enabled. DebugView in Firebase Analytics shows events when running the app with `FirebaseAnalytics.setAnalyticsCollectionEnabled(true)` and debug mode on.

---

### 7. Sentry

Create two Sentry projects in the same org:

| Project | Platform | Use |
|---------|----------|-----|
| `acog-server` | Node.js | NestJS unhandled exceptions |
| `acog-client` | JavaScript (or Cocos/custom) | Client crashes |

1. Copy each project's DSN.
2. Set `SENTRY_DSN` in `.env` files (server DSN). Client DSN goes in the Cocos project config.

**Verify:** trigger a deliberate error in development (`throw new Error('sentry test')`) and confirm it appears in the Sentry dashboard within a few seconds.

---

### 8. Cloudflare R2

1. Cloudflare Dashboard → R2 → Create bucket. Name: `acog` (or as preferred). Region: automatic.
2. Create an R2 API token with **Object Read & Write** permission scoped to the bucket.
3. Note the `Access Key ID` and `Secret Access Key`.

R2 bucket structure is created automatically by CI on first publish — no manual folder creation needed.

#### Custom Domain

Attach `acob.gootube.online` as a CDN custom domain for client asset downloads:

1. R2 → select your bucket → **Settings → Custom Domains → Connect Domain**
2. Enter `acob.gootube.online`
3. Cloudflare automatically creates a proxied CNAME record — no manual DNS step needed
4. Files are now accessible at `https://acob.gootube.online/<path>`

#### Cache Rules

Create three rules in **Cloudflare Dashboard → Caching → Cache Rules**, in this order (first match wins):

**Rule 1 — manifests (short TTL):**
- Match: `acob.gootube.online/hot-update/*.manifest`
- Cache eligibility: Eligible for cache
- Edge TTL: 60 seconds (override origin)

**Rule 2 — hot update assets (permanent cache):**
- Match: `acob.gootube.online/hot-update/*/assets/*`
- Cache eligibility: Eligible for cache
- Edge TTL: 1 year (override origin)

**Rule 3 — game bundles (bypass cache):**
- Match: `acob.gootube.online/game-bundles/*`
- Cache eligibility: Bypass cache

Manifests share the same URL on every publish → short TTL + purge on publish. Hot update assets are named with their MD5 hash — new content always gets a new URL, safe to cache forever. Game bundles are full replacements at the same path → bypassing cache avoids stale downloads without purge logic.

**Verify:** upload a test file and confirm it is accessible at `https://acob.gootube.online/<path>`. Check `CF-Cache-Status` response header matches expected behaviour per path type.

---

### 9. Cloudflare Origin Certificate

The Caddyfiles use a Cloudflare Origin Certificate instead of Let's Encrypt. This cert is trusted by Cloudflare (required for Full strict mode) but not by browsers directly — which is fine since all traffic goes through Cloudflare.

**Issue the cert (Cloudflare Dashboard):**

1. SSL/TLS → Origin Server → **Create Certificate**
2. Hostnames: `*.gootube.online`, `gootube.online`
3. Validity: 15 years
4. Download `origin-cert.pem` and `origin-key.pem`

**Install on each VPS** (prod-app and staging — SSH in manually):

```bash
sudo mkdir -p /etc/caddy/certs
sudo cp origin-cert.pem /etc/caddy/certs/
sudo cp origin-key.pem /etc/caddy/certs/
sudo chmod 600 /etc/caddy/certs/origin-key.pem
```

The cert directory is bind-mounted read-only into the Caddy container via `docker-compose.prod-app.yml` and `docker-compose.staging.yml`.

**Verify:** after first deploy, `curl -v https://acog.gootube.online/health 2>&1 | grep issuer` shows `Cloudflare` as the certificate issuer.

#### Cache Rule

Cloudflare does not cache JSON API responses by default. Create a rule to opt `/v1/config` in:

1. Cloudflare Dashboard → **Caching → Cache Rules → Create rule**
2. Match: `acog.gootube.online/v1/config`
3. Cache eligibility: **Eligible for cache**

#### Cache Purge API Token

The server calls Cloudflare's purge API when config is updated. Create a scoped token:

1. Cloudflare Dashboard → **My Profile → API Tokens → Create Token**
2. Permission: **Zone → Cache Purge → Purge**
3. Zone: `gootube.online` only
4. Copy the token → add to `.env.production` as `CLOUDFLARE_API_TOKEN`

Zone ID is on the Cloudflare Dashboard → `gootube.online` → **Overview** (right sidebar) → copy to `.env.production` as `CLOUDFLARE_ZONE_ID`.

#### Cloudflare Access (Admin Auth)

Protects `/admin` and `/v1/admin/*` with identity-based auth. No fixed IP needed — users authenticate via Google or email OTP. After auth, the admin page loads without any manual token entry.

1. Go to **Cloudflare Zero Trust** (one.dash.cloudflare.com) → complete first-time setup, which assigns a team domain (e.g. `your-team.cloudflareaccess.com`) → note it as `CF_TEAM_DOMAIN`
2. Access → Applications → **Add application → Self-hosted**
3. Name: `acog-admin`. Add two application domains:
   - Host: `acog.gootube.online`, Path: `admin`
   - Host: `acog.gootube.online`, Path: `v1/admin`
4. Identity providers: enable **Google** (or **One-time PIN** for email OTP)
5. Policy: Allow → Emails → your admin email(s)
6. After creation, open the app → copy the **Application Audience (AUD) tag** → add to `.env.production` as `CF_ACCESS_AUD`

**Verify:** navigate to `https://acog.gootube.online/admin` → Cloudflare login prompt appears. After login, admin page loads. `curl https://acog.gootube.online/v1/admin/config` without a valid CF token → 401.

---

### 10. GitHub Actions Secrets

Set these in the GitHub repo (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `REGISTRY_TOKEN` | GHCR token from step 5 |
| `R2_ACCESS_KEY_ID` | R2 API key from step 8 |
| `R2_SECRET_ACCESS_KEY` | R2 API secret from step 8 |
| `R2_BUCKET_NAME` | R2 bucket name from step 8 |
| `ADMIN_TOKEN` | Random secret for admin dashboard (min 32 chars) |
| `CLOUDFLARE_ZONE_ID` | Zone ID from Cloudflare Dashboard → `gootube.online` → Overview (right sidebar) |
| `CLOUDFLARE_API_TOKEN` | API token with **Zone → Cache Purge → Purge** permission (from step 9) |

**Verify:** GitHub → Actions → any workflow run → the secret names appear masked in logs where used.

---

### 11. VPS Environment Files

On each VPS, create `/opt/acog/.env.<environment>` (never committed). Use `.env.example` as the template.

**prod-data** — no `.env` file needed; passwords passed via `docker-compose.prod-data.yml` environment block. Create `/opt/acog/.env.production` with just:
```
DB_PASSWORD=<strong-random-password>
REDIS_PASSWORD=<strong-random-password>
```

**prod-app** — `/opt/acog/.env.production`:
```
DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@<prod-data-private-ip>:5432/acog
REDIS_URL=redis://:<REDIS_PASSWORD>@<prod-data-private-ip>:6379
JWT_ACCESS_SECRET=<256-bit random>
JWT_REFRESH_SECRET=<256-bit random, different from access>
FIREBASE_PROJECT_ID=<from Firebase Console>
FCM_SERVICE_ACCOUNT=<stringified JSON from step 6b>
SENTRY_DSN=<server DSN from step 7>
ADMIN_TOKEN=<same value as GitHub secret>
CLOUDFLARE_ZONE_ID=<zone ID from Cloudflare Dashboard → Overview>
CLOUDFLARE_API_TOKEN=<API token with Cache Purge permission scoped to the zone>
APP_BASE_URL=https://acog.gootube.online
CF_TEAM_DOMAIN=<your-team>.cloudflareaccess.com
CF_ACCESS_AUD=<AUD tag from Cloudflare Access application>
PORT=3000
NODE_ENV=production
```

**staging** — `/opt/acog/.env.staging`: same structure, staging-specific values (can share Firebase project with a staging app, or use the same project with separate Sentry environment tag).

Generate JWT secrets: `openssl rand -hex 32`

**Verify:** `docker compose --env-file .env.production config` on the VPS parses without errors.

---

### 12. First Deploy

On prod-data VPS:
```bash
cd /opt/acog
docker compose -f docker-compose.yml -f docker-compose.prod-data.yml up -d
```

**Verify:** `docker compose ps` shows `db` and `cache` running. `docker compose exec db psql -U postgres -c '\l'` lists the `acog` database.

On prod-app VPS — trigger the first deploy by pushing to `dev` (staging) or a `v*` tag (production), or manually:
```bash
cd /opt/acog
docker pull ghcr.io/<org>/server:<sha>
docker compose -f docker-compose.yml -f docker-compose.prod-app.yml up -d
```

Run the initial DB migration:
```bash
docker compose exec app node dist/app --run-migrations
```

**Verify:** `curl https://acog.gootube.online/health` returns `{"status":"ok","db":"ok","cache":"ok"}`.

---

### 13. Backup Cron (prod-data)

Set up a daily Postgres dump on prod-data:

```bash
# Install rclone for R2 uploads
curl https://rclone.org/install.sh | sudo bash
rclone config  # configure R2 as a remote named "r2"

# Create backup script at /opt/acog/backup.sh
# Content: pg_dump | gzip | rclone upload to r2:acog/backups/YYYY-MM-DD.sql.gz

chmod +x /opt/acog/backup.sh
crontab -e
# Add: 0 2 * * * /opt/acog/backup.sh >> /var/log/acog-backup.log 2>&1
```

**Verify:** run `backup.sh` manually and confirm the dump appears in the R2 bucket under `backups/`.

---

### 14. GitHub Actions Self-Hosted Runner (prod-app and staging)

The CI/CD deploy job runs directly on the target VPS instead of a GitHub-hosted VM. This avoids the need for inbound SSH access — the runner process polls GitHub for jobs and executes them locally.

Run these steps on **each VPS that receives deploys** (prod-app and staging):

```bash
# Create a dedicated directory
mkdir -p /opt/actions-runner && cd /opt/actions-runner

# Download the latest runner (get the exact URL from:
# GitHub repo → Settings → Actions → Runners → New self-hosted runner → Linux x64)
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-linux-x64-2.x.x.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

# Register the runner (token from GitHub UI — expires in 1 hour)
./config.sh --url https://github.com/<org>/<repo> --token <RUNNER_TOKEN>

# Install and start as a systemd service (survives reboots)
sudo ./svc.sh install
sudo ./svc.sh start

# Grant the runner user Docker access
sudo usermod -aG docker $(whoami)
# Log out and back in, or run: newgrp docker
```

**Verify:** GitHub → Settings → Actions → Runners — the runner appears as **Idle**.

> The registration token is single-use and expires in 1 hour. If it expires, generate a new one from the GitHub UI. The runner itself stays registered permanently until explicitly removed.
