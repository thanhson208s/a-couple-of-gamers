#!/usr/bin/env bash
# Stop the app + worker + admin services. Idempotent — stopping already-stopped
# services is a no-op. Uses docker compose's graceful stop, which honors
# `stop_grace_period: 15s` from docker-compose.yml.
#
# Usage:
#   scripts/shutdown.sh --env=production
#   scripts/shutdown.sh --env=staging
#
# Run on the VPS where app + worker + admin live (acog-app for production, acog-staging
# for staging). Other VPSes don't have these services in their compose project.

set -euo pipefail

ENV=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env=*) ENV="${1#*=}"; shift ;;
    *) echo "[shutdown] unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$ENV" == "production" || "$ENV" == "staging" ]] || { echo "[shutdown] --env=production|staging required" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$ENV" == "production" ]]; then
  ENV_FILE="$REPO_ROOT/.env.production"
  COMPOSE_FILE="docker-compose.prod-app.yml"
else
  ENV_FILE="$REPO_ROOT/.env.staging"
  COMPOSE_FILE="docker-compose.staging.yml"
fi
[[ -f "$ENV_FILE" ]] || { echo "[shutdown] env file not found: $ENV_FILE" >&2; exit 2; }

cd "$REPO_ROOT"

docker compose --env-file "$ENV_FILE" \
  -f docker-compose.yml -f "$COMPOSE_FILE" \
  stop app worker admin

echo "[shutdown] app + worker + admin stopped ($ENV)"
