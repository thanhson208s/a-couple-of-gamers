# Monitor Stack

This folder is the deployable monitoring stack for the monitor VPS.

## First Setup

Sparse-checkout only this folder on the VPS:

```sh
git clone --filter=blob:none --sparse git@github.com:OWNER/REPO.git /opt/acog
cd /opt/acog
git sparse-checkout set monitor
```

Create the runtime environment file:

```sh
cd /opt/acog/monitor
cp .env.example .env
```

Edit `.env` and set real values for:

- `POSTGRES_PASSWORD`
- `SECRET_KEY`
- `CREATE_SUPERUSER`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_THREAD_ID`

## Start

```sh
cd /opt/acog/monitor
docker compose --env-file .env -f compose.yml up -d
```

## Update

```sh
cd /opt/acog
git pull
cd monitor
docker compose --env-file .env -f compose.yml up -d
```

## Check

```sh
docker compose --env-file .env -f compose.yml ps
docker compose --env-file .env -f compose.yml logs --tail=100
```

## Notes

- `Caddyfile` routes `health.acoupleofgamers.com` to Uptime Kuma and `tracker.acoupleofgamers.com` to Bugsink.
- `slagram` listens on port `3000` inside Docker for Slack-compatible webhook messages at `/tracker` and `/health`.
- `.env`, `caddy/`, and `uptime-kuma-data/` are runtime state and should stay untracked.
- The stack binds host ports `80` and `443`, so it should run on a VPS where it owns those ports.
