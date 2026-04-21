# Infrastructure

Three-VPS deployment topology (prod-app, prod-data, staging), Docker Compose file structure per environment, and full provisioning configuration (DNS, TLS, Cloudflare services, external integrations, CI/CD).

---

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Edge                            │
│  DNS proxy · DDoS protection · TLS termination (client)     │
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

## Configuration

Complete from-scratch provisioning. Follow sections in order — later sections depend on earlier ones.

---

### VPS

**Why:** Three Oracle Cloud VMs are needed — one for the app stack, one for data services (isolated to avoid resource contention and restrict database network exposure), one for staging. Oracle Always Free tier covers this at no cost.

**Setup:**

Provision three VM instances in Oracle Cloud:

| Instance | Name | Shape | OS |
|----------|------|-------|----|
| prod-app | `acog-prod-app` | VM.Standard.A1.Flex (1 OCPU, 6 GB) | Oracle Linux 9 |
| prod-data | `acog-prod-data` | VM.Standard.A1.Flex (1 OCPU, 6 GB) | Oracle Linux 9 |
| staging | `acog-staging` | VM.Standard.A1.Flex (1 OCPU, 6 GB) | Oracle Linux 9 |

Place all three in the same **VCN** and **Availability Domain**. prod-app and prod-data must be in the same subnet so they can reach each other over the private network.

Open ingress rules on the VCN security list:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 80 | TCP | Cloudflare CIDRs (cloudflare.com/ips) | HTTP |
| 443 | TCP | Cloudflare CIDRs (cloudflare.com/ips) | HTTPS + WebSocket |
| 22 | TCP | Oracle Bastion CIDR | SSH via Bastion only |

**prod-data only** — open within VCN (private CIDR only):

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 5432 | TCP | VCN CIDR | Postgres from prod-app |
| 6379 | TCP | VCN CIDR | Redis from prod-app |

OS-level firewall on each VPS:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

Bootstrap Docker on all three VPS instances:

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker opc

sudo dnf install -y docker-compose-plugin

sudo mkdir -p /opt/acog
sudo chown opc:opc /opt/acog
git clone <repo-url> /opt/acog
```

Log out and back in so the `docker` group takes effect.

**Result:** All three instances show "Running" in the OCI Console. `docker compose version` returns a version string. Note the private IP of prod-data — needed for `DATABASE_URL` and `REDIS_URL` on prod-app.

---

### DNS, TLS & Reverse Proxy

**Why:** Cloudflare proxies all traffic to hide VPS IPs and provide DDoS protection. Caddy sits behind Cloudflare as the origin reverse proxy — it terminates TLS using a Cloudflare Origin Certificate (trusted by Full Strict mode, valid 15 years, no renewal needed), handles WebSocket upgrades, and forwards requests to the NestJS app.

**Setup:**

Add the `gootube.online` zone to Cloudflare:

1. Cloudflare Dashboard → **Add a site** → enter `gootube.online`. Update nameservers at your registrar to the two Cloudflare nameservers shown. Wait for propagation.
2. Create DNS A records with proxy **on** (orange cloud):

| Name | Type | Value | Proxy |
|------|------|-------|-------|
| `acog` | A | prod-app public IP | On |
| `acoq` | A | staging public IP | On |

3. SSL/TLS → Overview → set mode to **Full (strict)**.

Issue the Origin Certificate (Cloudflare Dashboard):

1. SSL/TLS → Origin Server → **Create Certificate**
2. Hostnames: `*.gootube.online`, `gootube.online`. Validity: 15 years.
3. Download `origin-cert.pem` and `origin-key.pem`.

Install on each VPS (prod-app and staging):

```bash
sudo mkdir -p /etc/caddy/certs
sudo cp origin-cert.pem /etc/caddy/certs/
sudo cp origin-key.pem /etc/caddy/certs/
sudo chmod 600 /etc/caddy/certs/origin-key.pem
```

The cert directory is bind-mounted read-only into the Caddy container via `docker-compose.prod-app.yml` and `docker-compose.staging.yml`.

The Caddyfile is also bind-mounted into the `proxy` container. One file per environment:

```
# Caddyfile.production
acog.gootube.online {
    tls /etc/caddy/certs/origin-cert.pem /etc/caddy/certs/origin-key.pem
    reverse_proxy app:3000
}

# Caddyfile.staging
acoq.gootube.online {
    tls /etc/caddy/certs/origin-cert.pem /etc/caddy/certs/origin-key.pem
    reverse_proxy app:3000
}
```

**Result:** `dig acog.gootube.online +short` returns a Cloudflare IP (not the VPS IP). After first deploy, `curl -v https://acog.gootube.online/health 2>&1 | grep issuer` shows `Cloudflare` as the certificate issuer.

---

### Cloudflare Services

**Why:** Three Cloudflare features require one-time setup: API response caching (`/v1/config` is read frequently — caching at the edge reduces server load), CDN cache rules for R2 assets (different TTL strategies per asset type), and Cloudflare Access (identity-based protection for `/admin` and `/v1/admin/*` without a fixed IP or VPN).

**Setup:**

**API cache rule** — Cloudflare does not cache JSON responses by default:

1. Cloudflare Dashboard → Caching → Cache Rules → Create rule
2. Match: `acog.gootube.online/v1/config`
3. Cache eligibility: **Eligible for cache**

When config is updated via `PUT /v1/admin/config`, the server calls the Cloudflare Purge API. Create a scoped purge token:

1. My Profile → API Tokens → Create Token
2. Permission: **Zone → Cache Purge → Purge**, Zone: `gootube.online` only
3. Copy the token → add to `.env.production` as `CLOUDFLARE_API_TOKEN`

Zone ID: Cloudflare Dashboard → `gootube.online` → Overview (right sidebar) → add to `.env.production` as `CLOUDFLARE_ZONE_ID`.

**R2 CDN cache rules** — complete [Cloudflare R2](#cloudflare-r2) first to attach `acob.gootube.online` as a custom domain before creating these rules. Create three rules in **Caching → Cache Rules**, in this order (first match wins):

**Rule 1 — manifests (short TTL):**
- Match: `acob.gootube.online/hot-update/*.manifest`
- Cache eligibility: Eligible for cache
- Edge TTL: 60 seconds (override origin)

**Rule 2 — hot update assets (permanent cache):**
- Match: `acob.gootube.online/hot-update/*/assets/*`
- Cache eligibility: Eligible for cache
- Edge TTL: 1 year (override origin)

**Rule 3 — game bundles (bypass cache):**
- Match: `acob.gootube.online/game-bundles/*`
- Cache eligibility: Bypass cache

Manifests share the same URL on every publish → short TTL. Hot update assets are MD5-named — new content always has a new URL, safe to cache permanently. Game bundles are full overwrites at the same path → bypass avoids stale downloads without purge logic.

**Cloudflare Access (admin protection):**

1. Cloudflare Zero Trust (one.dash.cloudflare.com) → complete first-time setup → note the team domain (e.g. `your-team.cloudflareaccess.com`) as `CF_TEAM_DOMAIN`
2. Access → Applications → Add application → **Self-hosted**
3. Name: `acog-admin`. Application domains:
   - Host: `acog.gootube.online`, Path: `admin`
   - Host: `acog.gootube.online`, Path: `v1/admin`
4. Identity providers: enable **Google** (or One-time PIN for email OTP)
5. Policy: Allow → Emails → your admin email(s)
6. After creation, open the app → copy the **Application Audience (AUD) tag** → add to `.env.production` as `CF_ACCESS_AUD`

**Result:** `curl -I https://acog.gootube.online/v1/config` shows `CF-Cache-Status: HIT` on second request. Navigate to `https://acog.gootube.online/admin` → Cloudflare login prompt appears. `curl https://acog.gootube.online/v1/admin/config` without a valid CF token → 401.

---

### GitHub Container Registry

**Why:** The NestJS deploy pipeline is split into two jobs — a `build` job on a GitHub-hosted runner that compiles and pushes the image, and a `deploy` job on the self-hosted VPS runner that pulls and applies it. GHCR is the handoff point between the two. No external registry costs — free for public repos and included in GitHub plans.

**Setup:**

The `build` job uses the built-in `GITHUB_TOKEN` to push to GHCR — no PAT needed, just grant `permissions: packages: write` in the workflow. The `deploy` job runs on the self-hosted VPS runner and needs a separate token to pull private images:

1. GitHub → Settings → Developer settings → Personal access tokens → create a token with `read:packages` scope.
2. Add as GitHub Actions secret: `REGISTRY_TOKEN` = the token value.

**Result:** After the first deploy workflow run, the package `ghcr.io/<org>/server` appears in the GitHub org's Packages tab.

---

### Firebase

**Why:** Firebase Authentication handles social sign-in (Google, Apple, Facebook) and issues tokens the server validates. FCM delivers push notifications (game invites, match updates). A single Firebase project serves all environments with separate apps per platform.

**Setup:**

**Authentication:**
1. Firebase Console → Authentication → Sign-in method → enable **Google**, **Apple**, **Facebook**.
2. For Apple: upload the `.p8` key and fill in Team ID + Key ID (required for APNs).
3. For Facebook: create a Facebook App at developers.facebook.com; copy App ID and App Secret into Firebase.

**Service account (server-side push notifications):**
1. Project settings → Service accounts → Generate new private key.
2. Download the JSON. Stringify it: `cat serviceAccount.json | jq -c .`
3. Set the result as `FCM_SERVICE_ACCOUNT` in VPS `.env` files.

**Client SDK config:**
1. Project settings → Your apps → Add app → iOS and Android.
2. Download `GoogleService-Info.plist` (iOS) and `google-services.json` (Android).
3. Place them in the Cocos Creator project under the appropriate platform directories.
4. Set `FIREBASE_PROJECT_ID` in `.env` files.

Firebase Analytics is enabled by default when adding the Firebase SDK — no server-side config needed.

**Result:** Firebase Console → Authentication shows sign-in providers as enabled. DebugView shows events when running the app with debug mode on.

---

### Sentry

**Why:** Captures unhandled exceptions from the NestJS server and client crashes with full stack traces and context, grouped by issue for triage.

**Setup:**

Create two Sentry projects in the same org:

| Project | Platform | Use |
|---------|----------|-----|
| `acog-server` | Node.js | NestJS unhandled exceptions |
| `acog-client` | JavaScript | Client crashes |

1. Copy each project's DSN.
2. Set `SENTRY_DSN` in VPS `.env` files (server DSN). Client DSN goes in the Cocos project config.

**Result:** Trigger a deliberate error in development — it appears in the Sentry dashboard within seconds.

---

### Cloudflare R2

**Why:** R2 stores Cocos hot-update manifests/assets and game bundles. Clients download these directly from the CDN custom domain, bypassing the NestJS server entirely and avoiding egress costs. Bucket structure:

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
  backups/         → daily Postgres dumps (see Backup)
```

- **Hot update**: only changed files are uploaded per publish (Cocos hot-update tool generates a diff against the previous manifest)
- **Game bundles**: full bundle per slug (INGAME scene + scripts + assets only — no metadata); version tracked in `games.remote_version` and URL in `games.remote_url` in Postgres, not in the R2 path
- **CDN**: served from `https://acob.gootube.online` (Cloudflare CDN custom domain on R2; no proxy through NestJS)

**Setup:**

1. Cloudflare Dashboard → R2 → Create bucket. Name: `acog`. Region: automatic.
2. Create an R2 API token with **Object Read & Write** permission scoped to the bucket.
3. Note the `Access Key ID` and `Secret Access Key` — needed in [Secrets & Environment](#secrets--environment).

Attach `acob.gootube.online` as the CDN custom domain:

1. R2 → select bucket → Settings → Custom Domains → **Connect Domain**
2. Enter `acob.gootube.online`
3. Cloudflare automatically creates a proxied CNAME — no manual DNS step needed.

The bucket folder structure is created automatically by CI on first publish. Cache rules for `acob.gootube.online` are configured in [Cloudflare Services](#cloudflare-services).

**Result:** Upload a test file and confirm it is accessible at `https://acob.gootube.online/<path>`. `CF-Cache-Status` response header matches expected behaviour per path type.

---

### Secrets & Environment

**Why:** Sensitive values (tokens, passwords, DSNs) must never be committed. CI workflows read them from GitHub Actions secrets; running containers read them from per-environment `.env` files on the VPS.

**Setup:**

Set these in the GitHub repo (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `REGISTRY_TOKEN` | GHCR `read:packages` PAT — lets the self-hosted runner pull images (see [GitHub Container Registry](#github-container-registry)) |
| `R2_ACCESS_KEY_ID` | R2 API key from [Cloudflare R2](#cloudflare-r2) |
| `R2_SECRET_ACCESS_KEY` | R2 API secret from [Cloudflare R2](#cloudflare-r2) |
| `R2_BUCKET_NAME` | R2 bucket name from [Cloudflare R2](#cloudflare-r2) |
| `ADMIN_TOKEN` | Random secret for admin API (min 32 chars) |
| `CLOUDFLARE_ZONE_ID` | Zone ID from [Cloudflare Services](#cloudflare-services) |
| `CLOUDFLARE_API_TOKEN` | Purge-scoped API token from [Cloudflare Services](#cloudflare-services) |

On each VPS, create `/opt/acog/.env.<environment>` (never committed). Use `.env.example` as the template.

**prod-data** — `/opt/acog/.env.production`:
```
DB_PASSWORD=<strong-random-password>
REDIS_PASSWORD=<strong-random-password>
```

**prod-app** — `/opt/acog/.env.production`:
```
DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@<prod-data-private-ip>:5432/acog
REDIS_URL=redis://:<REDIS_PASSWORD>@<prod-data-private-ip>:6379
JWT_ACCESS_SECRET=<256-bit random>
JWT_REFRESH_SECRET=<256-bit random, different from access>
FIREBASE_PROJECT_ID=<from Firebase Console>
FCM_SERVICE_ACCOUNT=<stringified JSON from Firebase service account>
SENTRY_DSN=<server DSN from Sentry>
ADMIN_TOKEN=<same value as GitHub secret>
CLOUDFLARE_ZONE_ID=<zone ID>
CLOUDFLARE_API_TOKEN=<purge-scoped API token>
APP_BASE_URL=https://acog.gootube.online
CF_TEAM_DOMAIN=<your-team>.cloudflareaccess.com
CF_ACCESS_AUD=<AUD tag from Cloudflare Access>
PORT=3000
NODE_ENV=production
```

**staging** — same structure with staging-specific values.

Generate JWT secrets: `openssl rand -hex 32`

**Result:** `docker compose --env-file .env.production config` on the VPS parses without errors. GitHub → Actions → any workflow run → secret names appear masked in logs.

---

### First Deploy

**Why:** Bootstraps the running system once all external services and environment files are in place.

**Setup:**

On prod-data VPS:
```bash
cd /opt/acog
docker compose -f docker-compose.yml -f docker-compose.prod-data.yml up -d
```

On prod-app VPS — trigger via a merge to `dev` (staging) or a `v*` tag (production). The CI/CD pipeline runs migrations automatically. To deploy manually without CI:
```bash
cd /opt/acog
docker login ghcr.io -u <github-username> -p <REGISTRY_TOKEN>
docker pull ghcr.io/<org>/server:<sha>
docker compose -f docker-compose.yml -f docker-compose.prod-app.yml up -d
docker compose exec app node dist/app --run-migrations
```

**Result:** `docker compose ps` shows `db` and `cache` running on prod-data. `curl https://acog.gootube.online/health` returns `{"status":"ok","db":"ok","cache":"ok"}`.

---

### Backup

**Why:** Daily Postgres dumps uploaded to R2 provide a point-in-time recovery option without relying on VPS snapshots.

**Setup:**

On prod-data VPS:
```bash
curl https://rclone.org/install.sh | sudo bash
rclone config  # configure R2 as a remote named "r2"

# Create /opt/acog/backup.sh
# Content: pg_dump | gzip | rclone upload to r2:acog/backups/YYYY-MM-DD.sql.gz

chmod +x /opt/acog/backup.sh
crontab -e
# Add: 0 2 * * * /opt/acog/backup.sh >> /var/log/acog-backup.log 2>&1
```

**Result:** Run `backup.sh` manually and confirm the dump appears in the R2 bucket under `backups/`.

---

### CI/CD

**Why:** Automated pipelines enforce that every merge to `dev` or production tag ships a tested, built artefact without manual steps. Self-hosted runners execute deploy jobs directly on the target VPS — no inbound SSH needed.

Two deployment targets run as parallel jobs on each trigger: the **VPS** (NestJS Docker image) and **R2** (Cocos assets + game bundles).

| Trigger | Jobs |
|---------|------|
| PR opened/updated | Lint + type check + unit tests |
| Merge to `dev` | (parallel) NestJS deploy → staging VPS + Cocos asset publish → R2 staging |
| Push tag `v*` | (parallel) NestJS deploy → production VPS + Cocos asset publish → R2 production |
| Changes to `client/res/games/<slug>/` on `dev` or `main` | Bundle-only publish: build affected bundle → upload to R2 (no VPS deploy) |

**NestJS deploy — two sequential jobs:**

`build` (GitHub-hosted runner, uses `GITHUB_TOKEN` with `packages: write`):
1. Build NestJS Docker image
2. Push to GitHub Container Registry

`deploy` (self-hosted runner on target VPS, `needs: build`, uses `REGISTRY_TOKEN` to pull):
1. Pull new image from GHCR
2. `docker compose up -d`
3. Run DB migrations
4. Health check

**Cocos asset publish job steps:**
1. Build Cocos main bundle
2. Run hot-update manifest tool → generate version diff against previous manifest
3. Upload changed assets to R2 `hot-update/<env>/`
4. Build all game bundles
5. Upload each to R2 `game-bundles/<env>/<slug>/` (overwrites previous)

**Self-hosted runner setup** — install on each VPS that receives deploys (prod-app and staging):

```bash
mkdir -p /opt/actions-runner && cd /opt/actions-runner

# Get the exact download URL from:
# GitHub repo → Settings → Actions → Runners → New self-hosted runner → Linux x64
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-linux-x64-2.x.x.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

# Register (token from GitHub UI — expires in 1 hour)
./config.sh --url https://github.com/<org>/<repo> --token <RUNNER_TOKEN>

# Install as a systemd service (survives reboots)
sudo ./svc.sh install
sudo ./svc.sh start

# Grant runner user Docker access
sudo usermod -aG docker $(whoami)
# Log out and back in, or: newgrp docker
```

> The registration token is single-use and expires in 1 hour. If it expires, generate a new one from the GitHub UI. The runner stays registered permanently until explicitly removed.

**Result:** GitHub → Settings → Actions → Runners — the runner appears as **Idle**. Push to `dev` triggers the staging pipeline end-to-end.
