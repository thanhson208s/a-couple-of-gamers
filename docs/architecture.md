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
       │                   │  Sentry     Firebase Analytics│
       │                   └───────────────────────────────┘
       ▼
┌──────────────┐
│  Cloudflare  │  DNS proxy, DDoS protection, TLS termination (client-facing)
│     Edge     │
└──────┬───────┘
       │
┌──────▼───────┐
│    Caddy     │  WS upgrade, TLS (Origin Certificate, origin-side)
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
│(presence · queue│  │               │
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
  Sentry         ←── NestJS unhandled exceptions + Cocos client crashes
```

---

## Services

### Internal Services

| Service | Runs on | Purpose |
|---------|---------|---------|
| **NestJS API Server** | prod-app VPS | Handles all HTTP and WebSocket traffic. Validates and applies game moves via the game plugin interface. Enqueues BullMQ jobs for background work. |
| **NestJS Worker Service** | prod-app VPS | Consumes BullMQ jobs from Redis. No HTTP listener. Runs inactive match cleanup (repeatable) and turn reminder dispatch (delayed). |
| **Caddy** | prod-app VPS | TLS termination (Cloudflare Origin Certificate), WebSocket upgrade headers. Reverse proxy to the API server. |
| **PostgreSQL** | prod-data VPS | Primary relational database. Single source of truth for all match state, user data, and history. Game state stored as JSONB. |
| **Redis** | prod-data VPS | Three roles: (1) WebSocket presence — single key `ws:{userId}`: absent = offline, `"lobby"` = connected in lobby, `<matchId>` = connected and viewing that match, (2) BullMQ job queue shared between API server and worker, (3) rate limit counters. |

### External Services

| Service | Purpose | Integrated by |
|---------|---------|--------------|
| **FCM** | Push notifications to iOS (via APNs bridge) and Android | NestJS API Server (inline, on move submission) and Worker (turn reminders) |
| **Cloudflare DNS Proxy** | DNS proxy for all client traffic; DDoS protection; hides origin VPS IP; client-facing TLS termination at edge | All HTTP/WS traffic from clients; Caddy authenticates to Cloudflare via Origin Certificate (Full strict SSL mode) |
| **Cloudflare R2** | Daily Postgres backups; hot update assets (main app); game bundles (CDN for client downloads) | Backups: OS cron on prod-data VPS. Hot update + bundles: CI/CD asset publish job. Client fetches directly from R2 CDN URL. |
| **Sentry** | Error tracking and crash reporting | NestJS API Server (unhandled exceptions); Cocos Creator client (crashes via Sentry JavaScript SDK) |
| **Firebase Authentication** | OAuth provider handling (Google/Apple/Facebook); issues ID tokens to the client | Cocos client (Firebase SDK for OAuth flow); NestJS API Server (Admin SDK for ID token verification) |
| **Firebase Analytics** | Client-side app event tracking (IAP, install) | Cocos client only |
| **Game Analytics** | Client-side game event tracking (for balance game design) | Cocos client only |
| **Firebase Remote Config** | Changing app parameters without needing an app update (e.g Holiday theme) | Cocos client only |
| **Revenue Cat** | Handle cross-platform in-app purchase, receipt, refund, acknowledge | Cocos client only |
| **Google Admob** | Responsible for fetching and showing ads | Cocos client only |

### Client

Cocos Creator targeting iOS and Android, written in TypeScript, is responsible for:
- Scene rendering: lobby, matches, profiles
- AI node: contains AI logic for each
- Ads and IAP management
