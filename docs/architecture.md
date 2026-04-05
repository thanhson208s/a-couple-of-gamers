# Architecture

Request flow diagram, all internal services (NestJS app, worker, Postgres, Redis, Nginx/Caddy) and external services (FCM, Cloudflare R2, Sentry, Firebase Analytics) with purpose and integration method, NestJS module responsibilities, and key architectural decisions.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│              Cocos Creator Client (iOS/Android)         │
│  ┌──────────┐  ┌───────────────────────┐  ┌──────────┐  │
│  │  Lobby   │  │   Match Scene         │  │  AI Node │  │
│  │  Scenes  │  │ (WS + HTTP, unified)  │  │ (local)  │  │
│  └──────────┘  └───────────────────────┘  └──────────┘  │
└──────┬──────────────────────────────────────────────────┘
       │ HTTP / WebSocket          │ SDK (Sentry, Firebase)
       │                   ┌───────┴───────────────────────┐
       │                   │  Sentry      Firebase Analytics│
       │                   └───────────────────────────────┘
       ▼
┌──────────────┐
│    Caddy     │  TLS termination, WS upgrade, HTTP→HTTPS
└──────┬───────┘
       │
┌──────▼──────────────────────────────────┐
│           NestJS API Server             │
│  ┌───────┐ ┌────────┐ ┌──────────────┐  │
│  │ Auth  │ │ Games  │ │   Matches    │  │
│  └───────┘ └────────┘ └──────────────┘  │
│  ┌───────┐ ┌──────────────────────────┐ │
│  │ Users │ │      WS Gateway          │ │
│  └───────┘ └──────────────────────────┘ │
└──────┬────────────────────┬─────────────┘
       │ enqueue jobs       │ read/write
       ▼                    ▼
┌─────────────────┐  ┌───────────────┐
│      Redis      │  │  PostgreSQL   │
│ (presence · queue│  │               │
│  · rate limits) │  └───────┬───────┘
└──────┬──────────┘          │ read/write
       │ consume jobs        │
┌──────▼──────────────────────▼──────────┐
│           NestJS Worker Service        │
│   (no HTTP; BullMQ consumers only)     │
│  ┌─────────────────┐ ┌──────────────┐  │
│  │ Reminder Worker │ │Cleanup Worker│  │
│  └─────────────────┘ └──────────────┘  │
└──────┬─────────────────────────────────┘
       │ dispatch push
       ▼
┌──────────────┐
│     FCM      │  (also called inline by API server on move submission)
└──────────────┘

External (not in request path):
  Cloudflare R2  ←── daily Postgres dump (OS cron on prod-data VPS)
  Sentry         ←── NestJS unhandled exceptions + Godot client crashes
```

---

## Services

### Internal Services

| Service | Runs on | Purpose |
|---------|---------|---------|
| **NestJS API Server** | prod-app VPS | Handles all HTTP and WebSocket traffic. Validates and applies game moves via the game plugin interface. Enqueues BullMQ jobs for background work. |
| **NestJS Worker Service** | prod-app VPS | Consumes BullMQ jobs from Redis. No HTTP listener. Runs inactive match cleanup (repeatable) and turn reminder dispatch (delayed). |
| **Caddy** | prod-app VPS | TLS termination (automatic Let's Encrypt), WebSocket upgrade headers, HTTP→HTTPS redirect. Reverse proxy to the API server. |
| **PostgreSQL** | prod-data VPS | Primary relational database. Single source of truth for all match state, user data, and history. Game state stored as JSONB. |
| **Redis** | prod-data VPS | Three roles: (1) WebSocket presence tracking per match, (2) BullMQ job queue shared between API server and worker, (3) rate limit counters. |

### External Services

| Service | Purpose | Integrated by |
|---------|---------|--------------|
| **FCM** | Push notifications to iOS (via APNs bridge) and Android | NestJS API Server (inline, on move submission) and Worker (turn reminders) |
| **Cloudflare R2** | Daily Postgres backups; hot update assets (main app); mini game bundles (CDN for client downloads) | Backups: OS cron on prod-data VPS. Hot update + bundles: CI/CD asset publish job. Client fetches directly from R2 CDN URL. |
| **Sentry** | Error tracking and crash reporting | NestJS API Server (unhandled exceptions); Cocos Creator client (crashes via Sentry JavaScript SDK) |
| **Firebase Authentication** | OAuth provider handling (Google/Apple/Facebook); issues ID tokens to the client | Godot client (Firebase SDK for OAuth flow); NestJS API Server (Admin SDK for ID token verification) |
| **Firebase Analytics** | Client-side event tracking (match started, game completed, IAP, etc.) | Godot client only |

### Client

Cocos Creator targeting iOS and Android, written in TypeScript. The client is render-only — it has no game state authority. All move validation and state transitions happen server-side via the game plugin interface. See [game-system.md](game-system.md).

Client responsibilities:
- Lobby scenes (catalog, favorites, active match list + badge)
- Match scene (board rendering, move input; handles async and real-time paths transparently)
- AI node (per-game local logic; submits moves via the same API as human players)
- Local SQLite cache for guest match history and offline browsing
- Auth flow (guest UUID, social login, guest→account merge)
- Ad and IAP management

---

## Server Modules

| Module | Responsibility |
|--------|---------------|
| `AuthModule` | Social login (Google/Apple/Facebook), guest UUID validation, JWT issuance, WS ticket issuance |
| `UsersModule` | User profiles, `is_ad_free` flag, guest→account merge, device token management |
| `GamesModule` | Game catalog, game plugin registry |
| `MatchesModule` | Match lifecycle: create, invite, join, complete; async move submission |
| `WsGateway` | WebSocket connections, real-time move dispatch, player presence in Redis |
| `NotificationsModule` | FCM push dispatch on async turns; enqueues delayed reminder jobs to BullMQ |
| `AdminModule` | Admin config endpoints (`/v1/admin/*`); serves static admin dashboard from `server/public/admin/`; protected by `X-Admin-Token` header |
| `ConfigModule` | Serves `GET /v1/config`; reads from `config` table |

---

## Key Architectural Decisions

**NestJS over Colyseus** — Colyseus is optimized for persistent real-time rooms; async-first play fights against its room lifecycle. At 100 CCU its performance advantages are irrelevant. NestJS gives full control over state management.

**REST for async moves, WebSocket only for real-time sessions** — Async play (hours between turns) does not need a persistent connection. REST + FCM push is simpler and more reliable for this pattern. WebSocket is layered on top when both players happen to be online.

**Client-side AI** — AI logic runs locally in the Cocos Creator client as a per-game TypeScript component and submits moves through the same API as human players. The server validates all moves regardless of source. This eliminates server-side AI infrastructure. Consequence: AI games require a running client.

**Postgres JSONB for game state** — Each game has a different state shape. JSONB lets each game plugin own its state structure without requiring schema migrations per game.

**Server is state authority** — Clients render only. All move validation and state transitions happen server-side via the game plugin interface. See [game-system.md](game-system.md).

**Separate API server and worker processes** — The NestJS codebase has two entry points: the API server (HTTP/WS) and the worker (no HTTP). They run as separate containers sharing Redis. Background jobs never compete with request handling.

**Shared TypeScript game plugin** — Game logic lives in `packages/game-logic/` and is imported by both the NestJS server (for vs Human move validation) and the Cocos Creator client (for vs AI offline play). One implementation, two runtimes.

**Client authority for offline AI matches** — AI matches run entirely client-side using the shared game plugin; the server records the final result but does not validate individual moves. This is safe because there is no opponent to cheat against in a single-player AI match.
