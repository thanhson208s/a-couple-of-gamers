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
export interface GameState   { [key: string]: unknown; }
export interface GameAction. { [key: string]: unknown; }
export interface GameMove    { [key: string]: unknown; }
export interface GameView    { [key: string]: unknown; }
export interface GameOptions { [key: string]: unknown; }

export interface GamePlugin {
  ...
}
```

See [game-system.md](game-system.md) for the full contract semantics.

**`packages/game-logic/src/index.ts`**
```typescript
export type { GamePlugin, GameOptions, GameState, GameAction, GameMove, GameView } from './interface';
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

**`packages/game-logic/tictactoe/src/index.ts`** — fully implemented (see source for details). Key points:
- State uses player indices (`1 | 2`) for board cells, `currentTurn`, and `winner` — no player IDs stored
- `initialState` ignores options (no TicTacToe variants)
- `getPlayerView` returns full state unchanged (open-information game)

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

**`modules/auth/`** — add `guards/` subdirectory with guards:
```
guards/admin-auth.guard.ts    # checks X-Admin-Token header
guards/jwt-auth.guard.ts      # verifies Bearer token, attaches req.user
guards/dev-auth.guard.ts      # returns 404 outside local dev
```
Register `JwtModule` in `auth.module.ts` and export all guards — see [structure.md#auth](structure.md#auth) for full module definition.

**`modules/games/`** — add `games.registry.ts` alongside the service:
```typescript
@Injectable()
export class GamesRegistry {
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
4. Place `GoogleService-Info.plist` (iOS) and `google-services.json` (Android) from the Firebase console into the platform directories
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

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with local values:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/acog
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=local-dev-access-secret-change-in-prod
JWT_REFRESH_SECRET=local-dev-refresh-secret-change-in-prod
FIREBASE_PROJECT_ID=           # leave empty unless testing Firebase services locally
FIREBASE_SERVICE_ACCOUNT={}    # leave empty unless testing firebase services locally
SENTRY_DSN=                    # leave empty locally
ADMIN_TOKEN=local-admin-token
PORT=3000
NODE_ENV=development
DEV_MODE=true
```

The Postgres credentials match `docker-compose.local.yml` (`postgres:postgres`). Redis runs without a password locally.

---

### 4. Start infrastructure

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

### 4a. Stop infrastructure

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

Stops and removes containers but **preserves the DB volume** — data survives a restart.

---

### 4b. Inspect Postgres and Redis (optional)

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

### 5. Run migrations

Generate the initial migration from entities (if there isn't already), then apply it:

```bash
npm run typeorm -w server -- migration:generate server/src/migrations/InitialSchema -d src/app.data.ts
npm run typeorm -w server -- migration:run -d server/src/app.data.ts
```

The generated file (e.g. `src/migrations/1234567890-InitialSchema.ts`) must be committed.

---

### 6. Start the API server

```bash
npm run start:dev -w server
```

This runs `nest start --watch` — TypeScript is compiled on the fly, server auto restarts on file changes.

**Verify:** `curl http://localhost:3000/health` returns `{"status":"ok","db":"ok","cache":"ok"}`.

Endpoints are prefixed with `/v1/` (e.g. `GET http://localhost:3000/v1/games`). The `/health` endpoint is the only exception.

---

### 7. Start the worker (optional)

The BullMQ worker processes background jobs. It is not required to run most features.

```bash
npm run start:worker:dev -w server
```

This runs `ts-node` with the `worker.ts` entry point. No HTTP port — it only connects to Redis and Postgres.

**Verify:** the terminal prints NestJS bootstrap logs and then stays running with no errors.

---

### 8. Open the client (Godot)

1. Open Godot → **Open Project** → select `client/`
2. Set the API base URL to `http://localhost:3000` in the project's network config
3. Use the Godot **Preview** button to run in-browser or on a simulator

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

For full environment provisioning (VPS, DNS, external services, CI/CD), see [infrastructure.md — Configuration](infrastructure.md#configuration).
