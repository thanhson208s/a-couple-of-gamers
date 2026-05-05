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
| `public/admin/` | Static HTML for the admin dashboard, served at `/admin` |
| `public/dev/` | Dev console HTML/JS/CSS, served at `/dev` (index.html, script.js, style.css) |
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
| `common/` | Shared infrastructure (guards, Redis, Firebase) |

---

## `server/src/logic/`

| File | Purpose |
|------|---------|
| `interface.ts` | `GamePlugin` TypeScript interface and shared types |
| `index.ts` | Re-exports all types from `interface.ts` |
| `*/index.ts` | Per-game plugin implementation |

→ Plugin contract and server authority model: [game-system.md](game-system.md)

---

## `server/src/common/`

### `firebase/`

| File | Purpose |
|------|---------|
| `firebase.module.ts` | `@Global()` module — initializes Firebase Admin SDK; provides `FIREBASE_AUTH` (`admin.auth()`) and `FIREBASE_MSG` (`admin.messaging()`) tokens app-wide |

### `guards/`

| File | Purpose |
|------|---------|
| `guards.module.ts` | Shared module — registers `JwtModule` and all four guards; exported for use by any feature module |
| `jwt-auth.guard.ts` | Verifies `Authorization: Bearer <token>`; attaches decoded payload to `req.user` |
| `admin-auth.guard.ts` | Prod: validates Cloudflare Access JWT. Dev: checks `X-Admin-Token` header |
| `dev-auth.guard.ts` | Returns 404 if `CF_TEAM_DOMAIN` is set or `NODE_ENV !== 'development'` |
| `rc-auth.guard.ts` | Validates RevenueCat webhook `Authorization: Bearer <RC_SECRET>` header |

### `helpers/`

| File | Purpose |
|------|---------|
| `test.helper.ts` | Shared test utilities — `mockRepository<T>()` and `mockHttpContext()` for unit tests |

### `redis/`

| File | Purpose |
|------|---------|
| `redis.module.ts` | `@Global()` module — provides `REDIS_CLIENT` (ioredis instance) to the whole app |

---

## `server/src/modules/`

### `auth/`

| File | Purpose |
|------|---------|
| `auth.module.ts` | Auth module — imports `GuardsModule`, `FirebaseModule`; exports `AuthService` |
| `auth.controller.ts` | `/v1/auth/*` HTTP controller |
| `auth.service.ts` | Firebase ID token verification, JWT issue/refresh/revoke, dev login |
| `refresh-token.entity.ts` | `refresh_tokens` table |

### `users/`

| File | Purpose |
|------|---------|
| `users.module.ts` | Users module — exports `UsersService` |
| `users.controller.ts` | `/v1/users/*` HTTP controller |
| `users.service.ts` | User profile, favorites, rivals, friends business logic |
| `user.entity.ts` | `users` table |
| `user-favorite.entity.ts` | `user_favorites` table |
| `user-rival.entity.ts` | `user_rivals` table (with stored generated `match_count` column) |
| `user-friend.entity.ts` | `user_friends` table (`pending` \| `accepted` status) |
| `user_entitlement.entity.ts` | `user_entitlements` table — RevenueCat entitlements (draft; no migration yet) |

### `games/`

| File | Purpose |
|------|---------|
| `games.module.ts` | Games module — provides `GamesRegistry` and `GamesService` |
| `games.controller.ts` | `/v1/games/*` HTTP controller |
| `games.service.ts` | Game catalog business logic |
| `games.registry.ts` | Injectable singleton — maps game id → `GamePlugin` instance |
| `game.entity.ts` | `games` table |

### `matches/`

| File | Purpose |
|------|---------|
| `matches.module.ts` | Matches module — imports `GamesModule`, `UsersModule`, `NotificationsModule` |
| `matches.controller.ts` | `/v1/matches/*` HTTP controller |
| `matches.service.ts` | Match lifecycle, Redis state cache, WS event handlers (`@OnWsMessage`, `@OnWsDisconnected`) |
| `match.entity.ts` | `matches` table |

### `ws/`

| File | Purpose |
|------|---------|
| `ws.module.ts` | WS module — exports `WsGateway` for injection by other modules |
| `ws.controller.ts` | `/v1/ws/ticket` — issues short-lived one-time WS tickets |
| `ws.gateway.ts` | WebSocket gateway at `/v1/ws` — authenticates via ticket, routes inbound messages to `@OnWsMessage` handlers, broadcasts events to users |
| `ws.service.ts` | WS ticket issue and validation (Redis `ws:ticket:*` keys) |
| `ws.decorators.ts` | `@OnWsMessage(event, dto?)`, `@OnWsConnected()`, `@OnWsDisconnected()` — metadata decorators scanned by `WsGateway` at startup |
| `ws.throttler.ts` | Redis INCR-based rate limiter for WS events |
| `ws.interceptor.ts` | `WsInterceptor` + `@WsThrottle()` decorator — applies WS rate limiting to individual message handlers |

### `notifications/`

| File | Purpose |
|------|---------|
| `notifications.module.ts` | Notifications module — registers `reminders` BullMQ queue; exports `NotificationsService` |
| `notifications.controller.ts` | `/v1/notifications/*` HTTP controller — FCM token upsert/delete |
| `notifications.service.ts` | FCM push dispatch and BullMQ reminder job management |
| `fcm-token.entity.ts` | `fcm_tokens` table (draft; no migration yet) |

### `maintenance/`

| File | Purpose |
|------|---------|
| `maintenance.module.ts` | Maintenance module — owns the `maintenance` BullMQ queue and processor |
| `maintenance.processor.ts` | BullMQ `maintenance` queue processor — broadcasts `system:maintenance` to all connected WS clients |
| `maintenance.service.ts` | Tracks scheduled maintenance state; sends `system:maintenance` to clients that connect during the window |

### `purchases/`

| File | Purpose |
|------|---------|
| `purchases.module.ts` | Purchases module — imports `UsersModule`, `GuardsModule` |
| `purchases.controller.ts` | `/v1/purchases/rc-webhook` — RevenueCat webhook receiver, guarded by `RcAuthGuard` |
| `purchases.service.ts` | RevenueCat event handlers (subscription, transfer, test events) |

### `config/`

| File | Purpose |
|------|---------|
| `config.module.ts` | Config module — exports `ConfigService` |
| `config.controller.ts` | `/v1/config` HTTP controller |
| `config.service.ts` | Dynamic app config business logic |
| `config.entity.ts` | `config` table + `ConfigData` interface |

### `dev/`

| File | Purpose |
|------|---------|
| `dev.module.ts` | Dev module — serves `public/dev/` as static files at `/dev`; imports `AuthModule`, `MatchesModule` |
| `dev.controller.ts` | `/v1/dev/*` API endpoints — all guarded by `DevAuthGuard` |

### `admin/`

| File | Purpose |
|------|---------|
| `admin.module.ts` | Admin module — serves `public/admin/` as static files at `/admin`; imports `ConfigModule`, `GamesModule` |
| `admin.controller.ts` | `/v1/admin/*` HTTP controller — guarded by `AdminAuthGuard` |

---

## `server/src/worker/`

| File | Purpose |
|------|---------|
| `worker.module.ts` | BullMQ worker module — registers `reminders` and `cleanup` queues; schedules repeating `stale-matches` cleanup job on startup |
| `processors/cleanup.processor.ts` | `cleanup` queue processor — calls `MatchesService.cleanupStaleMatches()` on the repeating schedule |
| `processors/reminder.processor.ts` | `reminders` queue processor — dispatches FCM turn-reminder push when a delayed job fires |

---

## `client/`

| Path | Purpose |
|------|---------|
| `games/` | One subdirectory per game slug — each is a Cocos Creator Asset Bundle |

Not yet scaffolded. Cocos Creator project files to be added.
