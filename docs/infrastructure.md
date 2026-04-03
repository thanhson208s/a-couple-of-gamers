# Infrastructure

Three-VPS deployment topology (prod-app, prod-data, staging), Docker Compose file structure per environment, Caddy reverse proxy setup, GitHub Actions CI/CD pipelines, TypeORM migration workflow, daily backup to Cloudflare R2, and monitoring setup.

---

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│          Oracle Cloud VPS — prod-app                        │
│          acog.gootube.online                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │    Caddy     │  │  NestJS app  │  │  NestJS worker     │ │
│  │ (TLS, WS     │  │  (HTTP/WS)   │  │  (BullMQ, no HTTP) │ │
│  │  upgrade)    │  └──────────────┘  └────────────────────┘ │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│          Oracle Cloud VPS — prod-data                       │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │ PostgreSQL       │    │ Redis                        │   │
│  └──────────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│          Oracle Cloud VPS — staging                         │
│          acoq.gootube.online                                │
│  Caddy + NestJS app + NestJS worker + Postgres + Redis      │
└─────────────────────────────────────────────────────────────┘
```

prod-app and prod-data communicate over Oracle private network. No public port exposure for DB or Redis.

---

## Docker Compose

| File | Used for |
|------|----------|
| `docker-compose.yml` | Base service definitions |
| `docker-compose.prod-app.yml` | Override for prod-app VPS (NestJS app + worker + proxy) |
| `docker-compose.prod-data.yml` | Override for prod-data VPS (Postgres + Redis) |
| `docker-compose.staging.yml` | Override for staging (all services, single host) |
| `docker-compose.local.yml` | Override for local dev (all services, dev ports) |

Services:
- `app` — NestJS API server (HTTP + WebSocket)
- `worker` — NestJS worker process (BullMQ consumers; same codebase as `app`, different entry point)
- `db` — PostgreSQL
- `cache` — Redis
- `proxy` — Caddy

Environment variables managed via `.env.<environment>` files. Never committed. Template: `.env.example`.

---

## Reverse Proxy

Caddy handles TLS (automatic Let's Encrypt cert issuance and renewal), WebSocket upgrade headers, and HTTP→HTTPS redirect with no manual configuration. The Caddyfile is bind-mounted into the `proxy` container.

Caddyfile per environment:

```
# Production (docker-compose.prod-app.yml)
acog.gootube.online {
    reverse_proxy app:3000
}

# Staging (docker-compose.staging.yml)
acoq.gootube.online {
    reverse_proxy app:3000
}
```

Caddy automatically handles HTTPS, certificate renewal, and WebSocket `Upgrade`/`Connection` headers for the proxied connection. No certbot, no renewal cron jobs.

---

## CI/CD

GitHub Actions pipelines:

| Trigger | Pipeline |
|---------|----------|
| PR opened/updated | Lint + type check + unit tests |
| Merge to `dev` branch | Build Docker image → deploy to staging |
| Push tag `v*` | Build Docker image → deploy to production |

Deploy steps:
1. Build NestJS Docker image
2. Push to container registry (TBD: GitHub Container Registry or Docker Hub)
3. SSH to target VPS → pull new image → `docker compose up -d`
4. Run DB migrations
5. Health check

Secrets managed via GitHub Actions secrets (never in repo).

---

## Database Migrations

Managed via TypeORM migrations.

- Migration files live in `server/src/migrations/` and are committed to the repository
- `synchronize: false` always — TypeORM auto-sync is never used in any environment
- Migrations run automatically as step 4 of the deploy job (before health check)
- To create a migration: generate via TypeORM CLI, review the SQL, commit alongside the schema change
- Rollback: TypeORM `down()` method; run manually if a deploy needs reverting

See [workflow.md#database-migrations](workflow.md#database-migrations) for the commands.

---

## Backup

- **Schedule** — daily Postgres dump via OS cron job on prod-data VPS
- **Destination** — Cloudflare R2 bucket, date-stamped
- **Retention** — TBD (e.g. 30 days rolling)
- **Restore procedure** — TBD; document after first test restore

---

## Monitoring

| Tool | What it monitors |
|------|-----------------|
| Sentry | NestJS unhandled exceptions; Godot client crashes |
| Uptime monitoring | TBD (e.g. UptimeRobot) — HTTP health endpoint `GET /health` |

`GET /health` returns `{ status: 'ok', db: 'ok', cache: 'ok' }`.
