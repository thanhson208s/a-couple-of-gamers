# Project Overview

What this project is, tech stack choices with rationale, target platforms, and scale constraints.

---

## About

**Title**: A Couple of Gamers.  
**Description**: A 2-player boardgame hub for iOS and Android. Players can play classic and modern board games in real-time or asynchronously against friends or AI opponents. Built as a self-learning project with a focus on correct architecture over scale.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Client | Cocos Creator + TypeScript | Cross-platform iOS/Android; TypeScript shared with server; good 2D support for board games |
| Server | NestJS + TypeScript | Structured modules, WebSocket gateway built-in, widely documented |
| Realtime transport | NestJS WebSocket Gateway (ws) | Sufficient for 100 CCU; no need for Colyseus overhead |
| Async transport | REST (HTTP) | Turn submission doesn't require a persistent connection |
| Cache / room presence | Redis | Fast in-memory store for WS presence, job queue, and rate limit counters |
| Job queue | BullMQ (via Redis) | Persistent delayed and repeatable jobs in a separate worker service |
| ORM | TypeORM | NestJS-native; parameterized queries by default; built-in migration system |
| Primary database | PostgreSQL | Relational; game state stored as JSONB for per-game flexibility |
| Object storage | Cloudflare R2 | Daily DB backups; hot update assets; game bundles (CDN) |
| Push notifications | Firebase Cloud Messaging (FCM) | Covers iOS (via APNs bridge) and Android from a single API |
| Authentication | Firebase Authentication | OAuth flow handling (Google/Apple/Facebook) on client; ID token verification via Admin SDK on server |
| Analytics | Firebase Analytics + Game Analytics | Client-side event tracking in Cocos |
| Error tracking | Sentry | Server exceptions and Cocos client crashes |
| Reverse proxy | Caddy | Automatic HTTPS (Let's Encrypt), WebSocket upgrade headers, HTTP→HTTPS redirect — zero cert management |
| CI/CD | GitHub Actions | Lint → test → build → deploy pipeline |
| Container runtime | Docker Compose | Per-environment service definitions |

---

## Project Context

| | |
|-|-|
| Platforms | iOS, Android |
| Expected CCU | ~100 |
| Expected DAU | ~500 |
