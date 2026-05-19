# Architecture

Request flow diagram, all internal services (NestJS app, worker, Postgres, Redis, Caddy) and external services (FCM, Cloudflare R2, Bugsink, Firebase Analytics, Grafana, Uptime Kuma) with purpose and integration method, NestJS module responsibilities, and key architectural decisions.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                Godot Client (iOS/Android)               │
│  ┌──────────┐  ┌───────────────────────┐  ┌──────────┐  │
│  │  Lobby   │  │   Match Scene         │  │  AI Node │  │
│  │  Scenes  │  │ (WS + HTTP, unified)  │  │ (local)  │  │
│  └──────────┘  └───────────────────────┘  └──────────┘  │
└──────┬──────────────────────────────────────────────────┘
       │ HTTP / WebSocket          │ SDK (Bugsink, Firebase)
       │                   ┌───────┴───────────────────────┐
       │                   │  Bugsink    Firebase Analytics│
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
  Cloudflare R2    ←── daily Postgres dump (cron) + predeploy Postgres dump (deploy workflow)
  Bugsink          ←── NestJS unhandled exceptions + Godot client crashes
  Grafana Alloy    ←── scrapes metrics/logs/traces from all VPS nodes
    → Grafana Cloud (Prometheus · Loki · Tempo)
  Uptime Kuma      ←── HTTP uptime checks against /health
```

---

## Services

### Internal Services

| Service | Runs on | Purpose |
|---------|---------|---------|
| **NestJS API Server** | acog-app VPS | Handles all HTTP and WebSocket traffic. Validates and applies game actions via the game plugin interface. Enqueues BullMQ jobs for background work. Also consumes the `websocket` queue for maintenance announcements (broadcast directly to WS clients). On SIGTERM: broadcasts `system:shutdown`, terminates all WS connections, clears `ws:user:{userId}` Redis presence keys, then exits within 30 s. |
| **NestJS Worker Service** | acog-app VPS | Consumes BullMQ jobs from Redis. No HTTP listener. Runs inactive match cleanup (repeatable) and turn reminder dispatch (delayed). |
| **Caddy** | acog-app VPS | TLS termination (Cloudflare Origin Certificate), WebSocket upgrade headers. Reverse proxy to the API server. |
| **PostgreSQL** | acog-data VPS | Primary relational database. Single source of truth for all match state, user data, and history. Game state stored as JSONB. |
| **Redis** | acog-data VPS | Four roles: (1) Pending match storage — `invite:code:{inviteCode}` (JSON, 24 h TTL) + `invite:user:{userId}` (sorted set index); Postgres row is created only when opponent joins. (2) WebSocket presence — single key `ws:user:{userId}`: absent = offline, `"lobby"` = connected in lobby, `<matchId>` = connected and viewing that match. (3) BullMQ job queue shared between API server and worker. (4) Rate limit counters. |

### External Services

| Service | Purpose | Integrated by |
|---------|---------|--------------|
| **FCM** | Push notifications to iOS (via APNs bridge) and Android | NestJS API Server (inline, on move submission) and Worker (turn reminders) |
| **Cloudflare DNS Proxy** | DNS proxy for all client traffic; DDoS protection; hides origin VPS IP; client-facing TLS termination at edge | All HTTP/WS traffic from clients; Caddy authenticates to Cloudflare via Origin Certificate (Full strict SSL mode) |
| **Cloudflare R2** | Postgres backups (daily + predeploy); hot update assets (main app); game bundles (CDN for client downloads) | Backups: Daily cron on acog-data VPS (prod) / acog-staging VPS (staging); predeploy backup triggered from `deploy-production.yml` on acog-app and `deploy-staging.yml` on the acog-staging VPS. Hot update + bundles: CI/CD asset publish job. Client fetches directly from R2 CDN URL. |
| **Bugsink** | Self-hosted error tracking and crash reporting (Sentry-compatible SDK) | NestJS API Server (unhandled exceptions); Godot client (crashes via Sentry-compatible SDK) |
| **Grafana Alloy** | Observability agent — scrapes metrics (Prometheus), ships logs (Loki), and traces (Tempo) from all VPS nodes to Grafana Cloud | Runs as a systemd service on each VPS; no application-level integration required |
| **Grafana Cloud** | Hosted observability backend: Prometheus (metrics), Loki (logs), Tempo (traces); dashboards and alerting | Receives data from Grafana Alloy |
| **Uptime Kuma** | HTTP uptime monitoring and alerting for public endpoints | Polls `/health` and public endpoints; self-hosted |
| **Firebase Authentication** | OAuth provider handling (Google/Apple/Facebook); issues ID tokens to the client | Godot client (Firebase SDK for OAuth flow); NestJS API Server (Admin SDK for ID token verification) |
| **Firebase Analytics** | Client-side app event tracking (IAP, install) | Godot client only |
| **Game Analytics** | Client-side game event tracking (for balance game design) | Godot client only |
| **Revenue Cat** | Handle cross-platform in-app purchase, receipt, refund, acknowledge | Godot client only |
| **Google Admob** | Responsible for fetching and showing ads | Godot client only |

### Client

Godot targeting iOS and Android, written in GDScript, is responsible for:
- Scene rendering: lobby, matches, profiles
- AI node: contains AI logic for each
- Ads and IAP management
