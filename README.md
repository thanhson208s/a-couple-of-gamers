# A Couple of Gamers

## Tech Stack

| Layer | Choice | Note |
|-------|--------|------|
| Client | Godot + GDScript | Cross-platform engine optimized for 2D |
| Server + Worker | NestJS + TypeScript | Structured module, built-in WS |
| Reverse proxy | Caddy | WebSocket upgrade + HTTPS redirect |
| Cache | Redis | Fast in-memory store for multiple uses |
| Job queue | BullMQ (via Redis) | Persistent delayed and repeatable jobs |
| Database | PostgreSQL | Relational, supports JSONB for game state |
| ORM | TypeORM | NestJS-native, built-in migration system |
| Object storage | Cloudflare R2 | DB backups, dynamic assets |
| DNS | Cloudflare DNS Proxy | Protection, hide origin IP, cache responses |
| Auth | Firebase Authentication | Supports Google, Facebook, Apple and anon |
| Push notifications | Firebase Cloud Messaging | Covers both IOS and Android /w same API |
| Analytics | Firebase Analytics | Client event tracking with Godot plugins |
| Container | Docker Compose | Easy isolated deployment |
| CI/CD | Github Actions + self hosted runners | Lint → test → build → deploy pipeline |
| Error tracking | Bugsink | Sentry-compatible, free self-hosted plan |
| Uptime | Uptime Kuma | Monitor uptime and critical endpoints |
| Metrics, Logs, Traces | Grafana Cloud/Alloy + exporters | Full monitoring /w Prometheus, Loki, Tempo |
| IAP | Revenue Cat | Unified interface for Android/IOS IAP |
| Ads | Google Admob | Integrate ads with mediation |

## Local Dev Setup

### 1. Prerequisites

Install before continuing:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org or `nvm install 20` |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop |
| Godot | 4.x (match project version) | https://godotengine.org |

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
npm install        # installs all workspace deps
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
BUGSINK_DSN=                   # leave empty locally
ADMIN_TOKEN=local-admin-token
PORT=3000
NODE_ENV=development
```

The Postgres credentials match `docker-compose.local.yml` (`postgres:postgres`). Redis runs without a password locally.

---

### 4. Start infrastructure

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up -d
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
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml down
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
2. Add a new connection: Host `host.docker.internal`, Port `6379`, Password: `redis`
3. Browse keys, inspect values, run CLI commands

---

### 5. Run migrations

Generate the initial migration from entities (if there isn't already), then apply it:

```bash
npm run migration:generate -w server -- src/migrations/InitialSchema
npm run migration:run -w server
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

### 8. Start the dev console (optional)

A browser-based dev console for testing API endpoints without the Godot client.

```bash
cd dev
npm install   # first time only
npm run dev
```

Opens at `http://localhost:5173`. Requires the API server (step 6) to be running. All `/v1/*` requests are proxied to `localhost:3000`.

---

### 9. Start the admin console (optional)

Browser-based admin console for changing server config.

```bash
cd admin
npm install   # first time only
npm run dev
```

Opens at `http://localhost:5173` (or next available port if the dev console is already running). Requires the API server (step 6) to be running. All `/v1/*` requests are proxied to `localhost:3000`.

---

### 10. Open the client (Godot)

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

# Terminal 4 - admin console (optional, first time: cd admin && npm install)
cd admin && npm run dev

# Terminal 5 — dev console (optional, first time: cd dev && npm install)
cd dev && npm run dev
```

All can be left running. The API server hot-reloads on save; the worker requires a manual restart on change.
