# Infrastructure

Three-VPS deployment topology (prod-app, prod-data, staging), Docker Compose file structure per environment, Caddy reverse proxy setup, GitHub Actions CI/CD pipelines (VPS deploy + R2 asset publish), TypeORM migration workflow, daily backup to Cloudflare R2, and monitoring setup.

---

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Edge                            │
│  DNS proxy · DDoS protection · TLS termination (client)    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
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

All client traffic reaches Caddy via the Cloudflare DNS proxy. Caddy handles origin-side TLS (Cloudflare Origin Certificate), WebSocket upgrade headers, and reverse proxying to the NestJS app. The Caddyfile is bind-mounted into the `proxy` container.

Caddyfile per environment:

```
# Production (Caddyfile.production)
acog.gootube.online {
    tls /etc/caddy/certs/origin-cert.pem /etc/caddy/certs/origin-key.pem
    reverse_proxy app:3000
}

# Staging (Caddyfile.staging)
acoq.gootube.online {
    tls /etc/caddy/certs/origin-cert.pem /etc/caddy/certs/origin-key.pem
    reverse_proxy app:3000
}
```

The Origin Certificate is installed at `/etc/caddy/certs/` on each VPS and bind-mounted read-only into the container. It is valid for 15 years — no renewal automation needed. See [setup.md#9-cloudflare-origin-certificate](setup.md#9-cloudflare-origin-certificate).

---

## Cloudflare Cache Rules

Cloudflare does not cache JSON API responses by default. A Cache Rule is required to opt in.

**One-time setup (Cloudflare Dashboard → Caching → Cache Rules):**

Create a rule matching `acog.gootube.online/v1/config`:
- Cache eligibility: **Eligible for cache**
- Cloudflare then honours the `Cache-Control` TTL set in the response header (`max-age=300, stale-while-revalidate=60`)

**Cache invalidation:** when an admin updates config via `PUT /v1/admin/config`, the server calls the Cloudflare Purge API to immediately evict the cached response. Requires `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, and `APP_BASE_URL` in the server's environment — see [setup.md#11-vps-environment-files](setup.md#11-vps-environment-files).

Game bundle publishes (CI/CD updating the `games` table) do **not** trigger a purge. Bundle metadata in the cached response may be up to 5 minutes stale after a publish — this is accepted.

---

## CI/CD

Two deployment targets run as parallel jobs on each trigger: the **VPS** (NestJS Docker image) and **R2** (Cocos assets + game bundles).

| Trigger | Jobs |
|---------|------|
| PR opened/updated | Lint + type check + unit tests |
| Merge to `dev` | (parallel) NestJS deploy → staging VPS + Cocos asset publish → R2 staging |
| Push tag `v*` | (parallel) NestJS deploy → production VPS + Cocos asset publish → R2 production |
| Changes to `client/games/<slug>/` on `dev` or `main` | Bundle-only publish: build affected bundle → upload to R2 (no VPS deploy) |

**NestJS deploy job steps:**
1. Build NestJS Docker image (admin static files at `server/public/admin/` embedded in image)
2. Push to container registry (TBD: GitHub Container Registry or Docker Hub)
3. SSH to target VPS → pull new image → `docker compose up -d`
4. Run DB migrations
5. Health check

**Cocos asset publish job steps:**
1. Build Cocos main bundle
2. Run hot-update manifest tool → generate version diff against previous manifest
3. Upload changed assets to R2 `hot-update/<env>/`
4. Build all game bundles
5. Upload each to R2 `game-bundles/<env>/<slug>/` (overwrites previous)

Secrets managed via GitHub Actions secrets (never in repo). Required secrets include: container registry credentials, VPS SSH key, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `ADMIN_TOKEN`.

---

## Asset Pipeline (R2)

Cloudflare R2 bucket structure:

```
r2://<bucket>/
  hot-update/
    production/    → version.manifest, project.manifest, assets/
    staging/       → same
  game-bundles/
    production/
      <slug>/      → latest Cocos bundle files (overwritten on each publish)
    staging/
      <slug>/      → same
  backups/         → daily Postgres dumps (see Backup section)
```

- **Hot update**: generated by Cocos Creator's hot-update tool; only changed files are uploaded per publish
- **Game bundles**: full bundle per slug; version tracked in `games.bundle_version` in Postgres, not in the R2 path
- **CDN**: client downloads bundles and hot update assets from `https://acob.gootube.online` (Cloudflare CDN custom domain on R2; no proxy through NestJS)

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
| Sentry | NestJS unhandled exceptions; Cocos Creator client crashes |
| Uptime monitoring | TBD (e.g. UptimeRobot) — HTTP health endpoint `GET /health` |

`GET /health` returns `{ status: 'ok', db: 'ok', cache: 'ok' }`.
