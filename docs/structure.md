# Repo Structure

Living map of the codebase. Update when files or directories are added or removed.

---

## Root

```
a-couple-of-gamers/
├── server/                  # NestJS API server + BullMQ worker
├── client/                  # Cocos Creator project
├── packages/
│   └── game-logic/          # Shared TypeScript game plugin (@acog/game-logic)
├── docs/                    # All design and reference docs
├── .github/workflows/       # CI (lint/test) and deploy (VPS + R2) pipelines
├── docker-compose.yml               # Base service definitions
├── docker-compose.local.yml         # Local dev overrides
├── docker-compose.staging.yml       # Staging (all services, single host)
├── docker-compose.prod-app.yml      # Production app VPS (NestJS + Caddy)
├── docker-compose.prod-data.yml     # Production data VPS (Postgres + Redis)
├── Caddyfile                # Reverse proxy: auto TLS, WS upgrade, HTTP→HTTPS
├── STRUCTURE.md             # (this file, now at docs/structure.md)
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
| `app.ts` | API server bootstrap — creates NestJS app, registers `ValidationPipe` globally, sets `/v1` global prefix, starts listening |
| `app.module.ts` | Root module — imports all feature modules and wires global providers |
| `app.health.ts` | `GET /health` controller — returns `{ status, db, cache }` |
| `app.data.ts` | TypeORM `DataSource` config — used by both the app and the TypeORM CLI for migrations |
| `worker.ts` | BullMQ worker bootstrap — starts a NestJS app with `WorkerModule` only, no HTTP listener |
| `modules/` | Feature modules (see below) |
| `worker/` | BullMQ job processors (see below) |
| `migrations/` | TypeORM migration files — committed to repo, auto-run on deploy |

---

## `server/src/modules/`

### `auth/`

| File | Purpose |
|------|---------|
| `auth.module.ts` | Registers `JwtModule` (access token secret + 15 min TTL); provides and exports all guards and `AuthService` |
| `auth.controller.ts` | `POST /v1/auth/social`, `/refresh`, `/ws-ticket`, `/guest-merge` |
| `auth.service.ts` | Stub — social login, token refresh, WS ticket issuance, guest merge |
| `guards/jwt-auth.guard.ts` | Verifies `Authorization: Bearer <token>`; attaches decoded payload to `req.user` |
| `guards/guest-auth.guard.ts` | Requires `X-Guest-Id` header; attaches UUID to `req.guestId` |
| `guards/optional-auth.guard.ts` | Tries JWT then guest header; never throws — for endpoints that serve both |
| `guards/admin.guard.ts` | Checks `X-Admin-Token` header against `ADMIN_TOKEN` env var |

### `users/`

| File | Purpose |
|------|---------|
| `users.module.ts` | Exports `UsersService` |
| `users.controller.ts` | `GET /v1/users/me`, `PUT /v1/users/me/device-token`, `DELETE /v1/users/me`, rivals endpoints |
| `users.service.ts` | Stub — profile fetch, device token upsert, account deletion, rival stats |
| `user.entity.ts` | `users` table — `id` (uuid), `provider`, `provider_id`, `display_name`, `created_at`; unique on `(provider, provider_id)` |

### `games/`

| File | Purpose |
|------|---------|
| `games.module.ts` | Provides `PluginRegistry` and `GamesService` |
| `games.controller.ts` | `GET /v1/games`, `GET /v1/games/:slug` |
| `games.service.ts` | Stub — catalog list, single game fetch |
| `plugin.registry.ts` | Injectable singleton — maps game slug → `GamePlugin` instance; `tictactoe` registered |
| `game.entity.ts` | `games` table — `id` (uuid), `slug` (unique), `name`, `is_active`, `is_preinstalled`, `bundle_url` |

### `matches/`

| File | Purpose |
|------|---------|
| `matches.module.ts` | Imports `GamesModule` (needs `PluginRegistry` for move validation) |
| `matches.controller.ts` | `POST /v1/matches`, `GET /v1/matches`, `GET /v1/matches/:id`, `POST /:id/join`, `DELETE /:id`, `POST /:id/moves`, `POST /:id/complete`, `GET /:id/invite` |
| `matches.service.ts` | Stub — create, list, get, join, abandon, submit move, complete AI match |
| `match.entity.ts` | `matches` table — id, game_id (FK), status, state (jsonb), player1/2 id+guest_uuid, current_turn, winner, invite_code, timestamps |
| `move.entity.ts` | `moves` table — id, match_id (FK), player_id, guest_uuid, move_data (jsonb), created_at |

### `ws/`

| File | Purpose |
|------|---------|
| `ws.module.ts` | Imports `MatchesModule` |
| `ws.gateway.ts` | WebSocket gateway — handles `connect`/`disconnect`, `move` and `ping` messages; stubs for real-time broadcast |

### `notifications/`

| File | Purpose |
|------|---------|
| `notifications.module.ts` | Service-only module (no HTTP controller) |
| `notifications.service.ts` | Stub — FCM dispatch, BullMQ job enqueue for reminders |

### `config/`

| File | Purpose |
|------|---------|
| `config.module.ts` | Exports `ConfigService` (renamed from `config`) |
| `config.controller.ts` | `GET /v1/config` — no auth required |
| `config.service.ts` | Stub — reads `config` table row |
| `config.entity.ts` | `config` table — id (serial), config (jsonb), updated_at, updated_by |

### `admin/`

| File | Purpose |
|------|---------|
| `admin.module.ts` | Imports `AuthModule` (for `AdminGuard`) and `ConfigModule`; serves static `/admin` via `ServeStaticModule` |
| `admin.controller.ts` | `GET /v1/admin/config`, `PUT /v1/admin/config` — guarded by `AdminGuard` |

---

## `server/src/worker/`

| File | Purpose |
|------|---------|
| `worker.module.ts` | Registers two BullMQ queues: `cleanup` (repeatable) and `reminders` (delayed) |
| `processors/cleanup.processor.ts` | Queries stale matches and marks them `abandoned` — stub |
| `processors/reminder.processor.ts` | Sends FCM turn reminder when delayed job fires — stub |

---

## `packages/game-logic/`

| Path | Purpose |
|------|---------|
| `src/interface.ts` | `GamePlugin` TypeScript interface — 5 methods: `initialState`, `applyMove`, `getPlayerView`, `isGameOver`, `getWinner` |
| `src/index.ts` | Package entry point |
| `tictactoe/src/index.ts` | `TicTacToePlugin` — reference implementation, methods stubbed |

→ Plugin contract and server authority model: [game-system.md](game-system.md)

---

## `client/`

| Path | Purpose |
|------|---------|
| `games/` | One subdirectory per game slug — each is a Cocos Creator Asset Bundle |

Not yet scaffolded. Cocos Creator project files to be added.
