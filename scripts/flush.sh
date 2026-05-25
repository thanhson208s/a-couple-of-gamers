#!/usr/bin/env bash
# FLUSHDB the Redis cache. Use after a db restore — stale Redis state
# (pending matches, WS presence, BullMQ jobs, rate-limit counters) references
# rows that may no longer exist in the restored db.
#
# Usage:
#   scripts/flush.sh --env=production    # run on acog-app or acog-data
#   scripts/flush.sh --env=staging       # run on acog-staging
#
# production: talks to Redis over the private network via `docker run --network host`
#             with REDIS_HOST + REDIS_PASSWORD from .env.production.
# staging:    talks to Redis via `docker compose exec`.
#
# Loses transient state by design: any pending matches, scheduled turn
# reminders, and rate-limit counters are gone. That is the cost of consistency
# with the restored db.

set -euo pipefail

ENV=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env=*) ENV="${1#*=}"; shift ;;
    *) echo "[flush] unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$ENV" == "production" || "$ENV" == "staging" ]] || { echo "[flush] --env=production|staging required" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$ENV" == "production" ]]; then
  ENV_FILE="$REPO_ROOT/.env.production"
else
  ENV_FILE="$REPO_ROOT/.env.staging"
  COMPOSE_FILE="docker-compose.staging.yml"
fi
[[ -f "$ENV_FILE" ]] || { echo "[flush] env file not found: $ENV_FILE" >&2; exit 2; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${REDIS_PASSWORD:?REDIS_PASSWORD not set in $ENV_FILE}"

if [[ "$ENV" == "production" ]]; then
  : "${REDIS_HOST:?REDIS_HOST not set in $ENV_FILE}"
  docker run --rm --network host redis:7-alpine \
    redis-cli -h "$REDIS_HOST" -p "${REDIS_PORT:-6379}" -a "$REDIS_PASSWORD" FLUSHDB
else
  cd "$REPO_ROOT"
  docker compose --env-file "$ENV_FILE" \
    -f docker-compose.yml -f "$COMPOSE_FILE" \
    exec -T cache redis-cli -a "$REDIS_PASSWORD" FLUSHDB
fi

echo "[flush] Redis FLUSHDB completed ($ENV)"
