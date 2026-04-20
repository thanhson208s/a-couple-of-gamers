# Repo Structure

Living map of the codebase. Update when files are added, removed, or renamed.

**Exclude:** *.dto.ts, *.spec.ts

---

## Root

```
a-couple-of-gamers/
├── server/                  # NestJS API server + BullMQ worker
├── client/                  # Cocos Creator project
├── docs/                    # All design and reference docs, containing this file
├── .github/workflows/       # CI (lint/test) and deploy (VPS + R2) pipelines
├── docker-compose.yml               # Base service definitions
├── docker-compose.local.yml         # Local dev overrides
├── docker-compose.staging.yml       # Staging (all services, single host)
├── docker-compose.prod-app.yml      # Production app VPS (NestJS + Caddy)
├── docker-compose.prod-data.yml     # Production data VPS (Postgres + Redis)
├── Caddyfile                # Reverse proxy: auto TLS, WS upgrade, HTTP→HTTPS
└── .env.example             # Environment variable template
```

---

## `server/`

Direct children:

| Path | Purpose |
|------|---------|
| `src/` | TypeScript source — see breakdown below |
| `dist/` | Compiled JS output (gitignored; produced by `nest build`) |
| `public/admin/` | Static HTML for the admin dashboard, embedded in the Docker image |
| `public/dev/` | Dev console (`GET /dev`) — `index.html` (renderer) + `script.js` (scenes/endpoints) + `style.css`, embedded in the Docker image |
| `Dockerfile` | Multi-stage build: `builder` compiles TS, `runtime` runs `dist/` |
| `package.json` | Dependencies and npm scripts (`start`, `start:dev`, `build`, `test`, `typeorm`) |
| `tsconfig.json` | Base TypeScript config (strict mode, ES2021 target) |
| `tsconfig.build.json` | Build config — extends base, excludes `**/*.spec.ts` and `test/` |
| `nest-cli.json` | NestJS CLI config (entry file, compiler options) |

---

## `server/src/`

Direct children:

| Path | Purpose |
|------|---------|
| `app.ts` | API server bootstrap |
| `app.module.ts` | Root module — imports all feature modules |
| `app.health.ts` | `GET /health` controller — returns `{ status, db, cache }` |
| `app.data.ts` | TypeORM `DataSource` config — used by both the app and the TypeORM CLI for migrations |
| `app.guard.ts` | Global `AppGuard` subclass — tracks by `userId` or IP; skips non-HTTP contexts |
| `worker.ts` | BullMQ worker bootstrap — starts a NestJS app with `WorkerModule` only, no HTTP listener |
| `modules/` | Feature modules (see below) |
| `worker/` | BullMQ job processors (see below) |
| `migrations/` | TypeORM migration files — committed to repo, auto-run on deploy |
| `logic/` | Game plugin interface and implementations (server-internal) |

---

## `server/src/logic/`

| File | Purpose |
|------|---------|
| `interface.ts` | `GamePlugin` TypeScript interface and shared types (`GameState`, `Move`, `PlayerView`, `GameOptions`) |
| `index.ts` | Re-exports all types from `interface.ts` |
| `*/index.ts` | Games reference implementation |

→ Plugin contract and server authority model: [game-system.md](game-system.md)

---

## `server/src/common/`

| File | Purpose |
|------|---------|
| `redis/redis.module.ts` | `@Global()` module — provides `REDIS_CLIENT` (ioredis instance) to the whole app |
| `test/helpers.ts` | Shared test utilities — `mockRepository<T>()` and `mockHttpContext()` for unit tests |

---

## `server/src/modules/`

### `auth/`

| File | Purpose |
|------|---------|
| `auth.module.ts` | Auth module — JWT setup, all guards, `AuthService` |
| `auth.controller.ts` | `/v1/auth/*` HTTP controller |
| `auth.service.ts` | Auth business logic |
| `guards/jwt-auth.guard.ts` | Verifies `Authorization: Bearer <token>`; attaches decoded payload to `req.user` |
| `guards/admin-auth.guard.ts` | Prod: validates Cloudflare Access JWT. Dev fallback: checks `X-Admin-Token` header |
| `guards/dev-auth.guard.ts` | Returns 404 if `CF_TEAM_DOMAIN` is set or `DEV_MODE !== 'true'` |
| `refresh-token.entity.ts` | `refresh_tokens` table |

### `users/`

| File | Purpose |
|------|---------|
| `users.module.ts` | Users module — registers `User` entity repository, exports `UsersService` |
| `users.controller.ts` | `/v1/users/*` HTTP controller |
| `users.service.ts` | User business logic |
| `user.entity.ts` | `users` table |

### `games/`

| File | Purpose |
|------|---------|
| `games.module.ts` | Games module — provides `GamesRegistry` and `GamesService` |
| `games.controller.ts` | `/v1/games/*` HTTP controller |
| `games.service.ts` | Game catalog business logic |
| `games.registry.ts` | Injectable singleton — maps game slug → `GamePlugin` instance |
| `game.entity.ts` | `games` table |

### `matches/`

| File | Purpose |
|------|---------|
| `matches.module.ts` | Matches module — imports `GamesModule` for move validation |
| `matches.controller.ts` | `/v1/matches/*` HTTP controller |
| `matches.service.ts` | Match lifecycle business logic |
| `match.entity.ts` | `matches` table |
| `move.entity.ts` | `moves` table |

### `ws/`

| File | Purpose |
|------|---------|
| `ws.module.ts` | WS module — imports `MatchesModule` |
| `ws.gateway.ts` | WebSocket gateway at `/v1/ws` — user-scoped persistent connection, move submission, real-time broadcast, Redis presence |
| `ws.throttler.ts` | Redis INCR-based rate limiter for WS events (ws-throttle: 30/user/min) |
| `ws.interceptor.ts` | `WsThrottlerInterceptor` + `@WsThrottle()` decorator — applies WS rate limiting to individual message handlers |

### `notifications/`

| File | Purpose |
|------|---------|
| `notifications.module.ts` | Notifications module — service-only (no HTTP controller) |
| `notifications.service.ts` | FCM push dispatch and BullMQ reminder job management |

### `config/`

| File | Purpose |
|------|---------|
| `config.module.ts` | Config module — exports `ConfigService` |
| `config.controller.ts` | `/v1/config` HTTP controller |
| `config.service.ts` | Dynamic app config business logic |
| `config.entity.ts` | `config` table |

### `dev/`

| File | Purpose |
|------|---------|
| `dev.module.ts` | Dev module — imports `AuthModule` and `MatchesModule` |
| `dev.controller.ts` | `GET /dev` (console page) + `/v1/dev/cheat/*` API endpoints — all guarded by `DevAuthGuard` |

### `admin/`

| File | Purpose |
|------|---------|
| `admin.module.ts` | Admin module — imports `AuthModule` and `ConfigModule`; serves static admin dashboard |
| `admin.controller.ts` | `/v1/admin/*` HTTP controller — guarded by `AdminAuthGuard` |

---

## `server/src/worker/`

| File | Purpose |
|------|---------|
| `worker.module.ts` | BullMQ worker module — registers `cleanup` and `reminders` queues |
| `processors/cleanup.processor.ts` | Marks stale matches as `abandoned` |
| `processors/reminder.processor.ts` | Dispatches FCM turn reminder when delayed job fires |

---

## `client/`

| Path | Purpose |
|------|---------|
| `games/` | One subdirectory per game slug — each is a Cocos Creator Asset Bundle |

Not yet scaffolded. Cocos Creator project files to be added.
