#!/usr/bin/env bash
# Postgres → R2 backup for prod and staging.
# Usage:
#   scripts/backup.sh --env=production --mode=daily
#   scripts/backup.sh --env=production --mode=predeploy --tag=<image-tag>
#   scripts/backup.sh --env=staging    --mode=daily
#   scripts/backup.sh --env=staging    --mode=predeploy --tag=<image-tag>
#
# Env decides which .env file to source and how to reach Postgres:
#   prod    daily     → acog-data VPS, docker compose exec
#   prod    predeploy → acog-app VPS, ephemeral pg_dump over private network
#   staging *         → acog-staging VPS, docker compose exec
#
# Both envs write timestamped keys and invoke prune.sh on success. Retention rules
# differ per env+mode (see prune.sh).

set -euo pipefail

ENV=""
MODE=""
TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env=*)  ENV="${1#*=}";  shift ;;
    --mode=*) MODE="${1#*=}"; shift ;;
    --tag=*)  TAG="${1#*=}";  shift ;;
    *) echo "[backup] unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$ENV"  == "production" || "$ENV"  == "staging" ]] || { echo "[backup] --env=production|staging required" >&2; exit 2; }
[[ "$MODE" == "daily" || "$MODE" == "predeploy" ]] || { echo "[backup] --mode=daily|predeploy required" >&2; exit 2; }
if [[ "$MODE" == "predeploy" && -z "$TAG" ]]; then
  echo "[backup] --tag=<image-tag> required for --mode=predeploy" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$ENV" == "production" ]]; then
  ENV_FILE="$REPO_ROOT/.env.production"
  COMPOSE_FILE="docker-compose.prod-data.yml"
else
  ENV_FILE="$REPO_ROOT/.env.staging"
  COMPOSE_FILE="docker-compose.staging.yml"
fi

[[ -f "$ENV_FILE" ]] || { echo "[backup] env file not found: $ENV_FILE" >&2; exit 2; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${R2_BACKUP_BUCKET:?R2_BACKUP_BUCKET not set in $ENV_FILE}"
: "${R2_BACKUP_ACCESS_KEY_ID:?R2_BACKUP_ACCESS_KEY_ID not set in $ENV_FILE}"
: "${R2_BACKUP_SECRET_ACCESS_KEY:?R2_BACKUP_SECRET_ACCESS_KEY not set in $ENV_FILE}"
: "${R2_BACKUP_ENDPOINT:?R2_BACKUP_ENDPOINT not set in $ENV_FILE}"

push_monitor() {
  local status="$1"
  local msg="$2"

  [[ "$ENV" == "production" ]] || return 0
  [[ "$MODE" == "daily" ]] || return 0

  [[ -n "${HEARTBEAT_ACCESS_CLIENT_ID:-}" ]] || return 0
  [[ -n "${HEARTBEAT_ACCESS_CLIENT_SECRET:-}" ]] || return 0

  curl -fsSL -G \
    -H "CF-Access-Client-Id: ${HEARTBEAT_ACCESS_CLIENT_ID}" \
    -H "CF-Access-Client-Secret: ${HEARTBEAT_ACCESS_CLIENT_SECRET}" \
    --data-urlencode "status=${status}" \
    --data-urlencode "msg=${msg}" \
    "https://health.acoupleofgamers.com/api/push/gbh4CTr5pJ" \
    >/dev/null || true
}

trap 'push_monitor down "backup failed"' ERR

# rclone reads its config from RCLONE_CONFIG_<remote>_* env vars; map our names onto the
# "r2:" remote.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_BACKUP_ENDPOINT"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# Tables to back up. matches, refresh_tokens, fcm_tokens are intentionally excluded.
TABLES=(
  users
  user_favorites
  user_rivals
  user_friends
  user_gifts
  user_entitlements
  games
  config
)

TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=("-t" "$t")
done

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DATE_UTC="$(date -u +%Y-%m-%d)"
TAG_SAFE="$(printf '%s' "${TAG}" | tr -c 'A-Za-z0-9._-' '_')"

case "$MODE" in
  daily)     OBJECT="daily/${DATE_UTC}-${TIMESTAMP}.sql.gz" ;;
  predeploy) OBJECT="predeploy/${TAG_SAFE}-${TIMESTAMP}.sql.gz" ;;
esac

TMP_DUMP="$(mktemp -t acog-backup.XXXXXX.sql.gz)"
trap 'rm -f "$TMP_DUMP"' EXIT

echo "[backup] env=$ENV mode=$MODE object=r2:${R2_BACKUP_BUCKET}/${OBJECT}"

# Dump to a local file first so a partial pg_dump never reaches R2.
if [[ "$ENV" == "production" && "$MODE" == "predeploy" ]]; then
  # Running on acog-app VPS — Postgres is remote over the private network.
  : "${DB_PASSWORD:?DB_PASSWORD not set in $ENV_FILE}"
  docker run --rm --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    postgres:16-alpine \
    pg_dump -h "${DB_HOST:-10.0.1.14}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-acog}" \
      "${TABLE_ARGS[@]}" \
    | gzip > "$TMP_DUMP"
else
  # Running on the same VPS as the db container — exec into it.
  cd "$REPO_ROOT"
  docker compose --env-file "$ENV_FILE" \
    -f docker-compose.yml -f "$COMPOSE_FILE" \
    exec -T db pg_dump -U "${DB_USER:-postgres}" -d "${DB_NAME:-acog}" "${TABLE_ARGS[@]}" \
    | gzip > "$TMP_DUMP"
fi

if [[ ! -s "$TMP_DUMP" ]]; then
  echo "[backup] dump file is empty — aborting upload" >&2
  exit 1
fi

docker run --rm \
  -v "$TMP_DUMP":/dump.sql.gz:ro \
  -e RCLONE_CONFIG_R2_TYPE \
  -e RCLONE_CONFIG_R2_PROVIDER \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID \
  -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_ENDPOINT \
  -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
  rclone/rclone \
  copyto /dump.sql.gz "r2:${R2_BACKUP_BUCKET}/${OBJECT}"

echo "[backup] uploaded $(stat -c%s "$TMP_DUMP" 2>/dev/null || stat -f%z "$TMP_DUMP") bytes"

"$SCRIPT_DIR/prune.sh" --env="$ENV" --mode="$MODE"

push_monitor up "backup ok: ${OBJECT}"