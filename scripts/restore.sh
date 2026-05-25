#!/usr/bin/env bash
# Restore an R2 backup. Two modes:
#   default  — restore into a throwaway postgres:16-alpine container, verify, tear down.
#   --real   — restore into the LIVE prod / staging db. Destructive. Confirmation required.
#
# Usage:
#   scripts/restore.sh --env=production --list=daily
#   scripts/restore.sh --env=staging    --latest=daily
#   scripts/restore.sh --env=production --key=daily/2026-05-19-20260519T020000Z.sql.gz
#   scripts/restore.sh --env=staging    --latest=predeploy --keep
#   scripts/restore.sh --env=staging    --latest=daily --real
#
# Flags:
#   --env=production|staging   Which .env file (and R2 bucket) to use.
#   --list=daily|predeploy     Print available backups (most recent first) and exit.
#   --latest=daily|predeploy   Pick the most recent backup of that mode.
#   --key=<path>               Restore a specific R2 object path (inside the bucket).
#   --real                     Write into the live db (default is a scratch container).
#   --keep                     (scratch only) Leave the scratch container running for inspection.
#
# Notes for --real:
# - production: talks to the db over the private network via `docker run --network host`
#   + DB_HOST/DB_PASSWORD from .env.production. Runs from either acog-app or acog-data.
# - staging:    talks to the db via `docker compose exec`. Runs on the staging VPS.
# - Pre-flight: refuses to start if the db isn't reachable (pg_isready).
# - Always runs a scratch restore first as a gate — if the backup is corrupt or the dump
#   fails to apply cleanly, the live db is never touched.
# - After the gate passes, drops the backed-up tables with CASCADE and applies the dump
#   to the live db. CASCADE also drops FKs in non-backed-up tables (matches.user_id →
#   users.id, etc.). TypeORM does NOT auto-recreate them — see docs/recovery.md for the
#   manual ALTER TABLE commands.
# - Requires an interactive terminal (refuses to run in CI). Operator must type an
#   env-specific confirmation phrase.
# - Does NOT check that app/worker are stopped. That's the operator's job
#   (see runbook); concurrent writes during restore are a real foot-gun.

set -euo pipefail

ENV=""
KEY=""
LATEST=""
LIST=""
KEEP=0
REAL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env=*)    ENV="${1#*=}";    shift ;;
    --key=*)    KEY="${1#*=}";    shift ;;
    --latest=*) LATEST="${1#*=}"; shift ;;
    --list=*)   LIST="${1#*=}";   shift ;;
    --real)     REAL=1;           shift ;;
    --keep)     KEEP=1;           shift ;;
    *) echo "[restore] unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$ENV" == "production" || "$ENV" == "staging" ]] || { echo "[restore] --env=production|staging required" >&2; exit 2; }

if [[ $KEEP -eq 1 && $REAL -eq 1 ]]; then
  echo "[restore] --keep is not compatible with --real (scratch only)" >&2
  exit 2
fi

NON_EMPTY=0
[[ -n "$KEY"    ]] && NON_EMPTY=$((NON_EMPTY+1))
[[ -n "$LATEST" ]] && NON_EMPTY=$((NON_EMPTY+1))
[[ -n "$LIST"   ]] && NON_EMPTY=$((NON_EMPTY+1))
if [[ $NON_EMPTY -ne 1 ]]; then
  echo "[restore] exactly one of --key, --latest, --list is required" >&2
  exit 2
fi

for choice in "$LATEST" "$LIST"; do
  if [[ -n "$choice" && "$choice" != "daily" && "$choice" != "predeploy" ]]; then
    echo "[restore] --latest / --list must be 'daily' or 'predeploy', got '$choice'" >&2
    exit 2
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ "$ENV" == "production" ]]; then
  ENV_FILE="$REPO_ROOT/.env.production"
  COMPOSE_FILE="docker-compose.prod-data.yml"
else
  ENV_FILE="$REPO_ROOT/.env.staging"
  COMPOSE_FILE="docker-compose.staging.yml"
fi
[[ -f "$ENV_FILE" ]] || { echo "[restore] env file not found: $ENV_FILE" >&2; exit 2; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${R2_BACKUP_BUCKET:?R2_BACKUP_BUCKET not set in $ENV_FILE}"
: "${R2_BACKUP_ACCESS_KEY_ID:?R2_BACKUP_ACCESS_KEY_ID not set in $ENV_FILE}"
: "${R2_BACKUP_SECRET_ACCESS_KEY:?R2_BACKUP_SECRET_ACCESS_KEY not set in $ENV_FILE}"
: "${R2_BACKUP_ENDPOINT:?R2_BACKUP_ENDPOINT not set in $ENV_FILE}"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_BACKUP_ENDPOINT"

# Must match the table set in backup.sh.
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

rclone_run() {
  docker run --rm \
    -e RCLONE_CONFIG_R2_TYPE \
    -e RCLONE_CONFIG_R2_PROVIDER \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
    -e RCLONE_CONFIG_R2_ENDPOINT \
    "$@"
}

# Live-db psql (used by --real). Production goes over the private network via
# `docker run --network host` so the script works from either acog-app or acog-data.
# Staging uses compose exec (db sits in the same compose project on the staging VPS).
live_psql() {
  if [[ "$ENV" == "production" ]]; then
    : "${DB_HOST:?DB_HOST not set in $ENV_FILE}"
    : "${DB_PASSWORD:?DB_PASSWORD not set in $ENV_FILE}"
    docker run --rm -i --network host \
      -e PGPASSWORD="$DB_PASSWORD" \
      postgres:16-alpine \
      psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-acog}" "$@"
  else
    cd "$REPO_ROOT"
    docker compose --env-file "$ENV_FILE" \
      -f docker-compose.yml -f "$COMPOSE_FILE" \
      exec -T db psql "$@"
  fi
}

# Pre-flight: refuse --real if the db isn't reachable.
check_db_running() {
  if [[ "$ENV" == "production" ]]; then
    : "${DB_HOST:?DB_HOST not set in $ENV_FILE}"
    if ! docker run --rm --network host postgres:16-alpine \
         pg_isready -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" >/dev/null 2>&1; then
      echo "[restore] postgres not reachable at ${DB_HOST}:${DB_PORT:-5432}" >&2
      exit 1
    fi
  else
    cd "$REPO_ROOT"
    if ! docker compose --env-file "$ENV_FILE" \
         -f docker-compose.yml -f "$COMPOSE_FILE" \
         exec -T db true >/dev/null 2>&1; then
      echo "[restore] db service not running on the staging VPS" >&2
      exit 1
    fi
  fi
}

build_verification_sql() {
  local first=1 t
  for t in "${TABLES[@]}"; do
    if [[ $first -eq 1 ]]; then
      printf "SELECT '%s' AS tbl, count(*) AS n FROM %s" "$t" "$t"
      first=0
    else
      printf "\nUNION ALL SELECT '%s', count(*) FROM %s" "$t" "$t"
    fi
  done
  printf ";\n"
}

# --list: print available backups and exit.
if [[ -n "$LIST" ]]; then
  echo "[restore] listing r2:${R2_BACKUP_BUCKET}/${LIST} (most recent first)"
  rclone_run rclone/rclone lsjson --recursive --files-only "r2:${R2_BACKUP_BUCKET}/${LIST}" \
    | python3 -c "
import json, sys
entries = json.load(sys.stdin)
entries.sort(key=lambda e: e['ModTime'], reverse=True)
for e in entries:
    print(f\"  {e['ModTime']}  {int(e['Size']):>12}  ${LIST}/{e['Path']}\")
"
  exit 0
fi

# --latest: resolve to a concrete key.
if [[ -n "$LATEST" ]]; then
  KEY="$(rclone_run rclone/rclone lsjson --recursive --files-only "r2:${R2_BACKUP_BUCKET}/${LATEST}" \
    | python3 -c "
import json, sys
entries = json.load(sys.stdin)
if not entries:
    sys.exit('no objects under ${LATEST}/')
entries.sort(key=lambda e: e['ModTime'], reverse=True)
print(f\"${LATEST}/{entries[0]['Path']}\")
")"
  echo "[restore] --latest resolved to: $KEY"
fi

TMP_DIR="$(mktemp -d -t acog-restore.XXXXXX)"

# For --real, pre-flight + confirm BEFORE downloading anything.
if [[ $REAL -eq 1 ]]; then
  if [[ ! -t 0 ]]; then
    echo "[restore] --real requires an interactive terminal for confirmation" >&2
    exit 2
  fi
  check_db_running
  EXPECTED="RESTORE ${ENV}"
  cat >&2 <<WARN

  ╭────────────────────────────────────────────────────────────────────╮
  │  REAL RESTORE — this will OVERWRITE the LIVE ${ENV} database.
  │
  │  • A scratch restore runs first as a gate; live db is touched only
  │    if the scratch restore succeeds.
  │  • Drops these tables with CASCADE:
  │      ${TABLES[*]}
  │  • CASCADE will also drop FKs in non-backed-up tables
  │    (matches, refresh_tokens, fcm_tokens). TypeORM will NOT auto-recreate
  │    them — see docs/recovery.md for the manual ALTER TABLE commands.
  │  • Source: r2:${R2_BACKUP_BUCKET}/${KEY}
  │
  │  Type exactly:  ${EXPECTED}
  ╰────────────────────────────────────────────────────────────────────╯

WARN
  read -r -p "> " CONFIRM
  if [[ "$CONFIRM" != "$EXPECTED" ]]; then
    echo "[restore] confirmation mismatch — aborted" >&2
    exit 1
  fi
fi

CONTAINER="acog-restore-${ENV}-$(date -u +%Y%m%dT%H%M%SZ)-$$"

cleanup() {
  local code=$?
  if [[ $REAL -eq 0 && $KEEP -eq 1 && $code -eq 0 ]]; then
    echo
    echo "[restore] scratch container kept running:"
    echo "  name:    $CONTAINER"
    echo "  connect: docker exec -it $CONTAINER psql -U postgres -d acog"
    echo "  remove:  docker rm -f $CONTAINER"
  else
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
  exit $code
}
trap cleanup EXIT

echo "[restore] downloading r2:${R2_BACKUP_BUCKET}/${KEY} → $TMP_DIR/dump.sql.gz"
rclone_run -v "$TMP_DIR":/out rclone/rclone copyto "r2:${R2_BACKUP_BUCKET}/${KEY}" /out/dump.sql.gz

[[ -s "$TMP_DIR/dump.sql.gz" ]] || { echo "[restore] downloaded file is empty" >&2; exit 1; }

VERIFY_SQL="$(build_verification_sql)"

# Scratch restore always runs — for --real it's the gate that proves the dump is sound
# before the live db is touched.
echo "[restore] starting scratch postgres: $CONTAINER"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=scratch \
  -e POSTGRES_DB=acog \
  -e POSTGRES_USER=postgres \
  postgres:16-alpine >/dev/null

for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d acog >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "[restore] scratch postgres failed to become ready" >&2
    docker logs --tail=50 "$CONTAINER" >&2 || true
    exit 1
  fi
done

echo "[restore] applying dump to scratch"
gunzip < "$TMP_DIR/dump.sql.gz" \
  | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d acog >/dev/null

echo "[restore] verification (row counts in scratch):"
echo "$VERIFY_SQL" \
  | docker exec -i "$CONTAINER" psql -U postgres -d acog -At -F $'\t' \
  | awk -F'\t' '{ printf "  %-22s %s\n", $1, $2 }'

if [[ $REAL -eq 0 ]]; then
  echo "[restore] ok"
  exit 0
fi

# --real: scratch verification passed. Re-check db is still up (it may have died between
# the pre-flight check and now) and apply the dump to the live db.
echo
echo "[restore] scratch verified — applying to live $ENV db"
check_db_running

DROP_LIST="$(IFS=,; echo "${TABLES[*]}")"

echo "[restore] dropping backed-up tables (CASCADE) in live $ENV db"
live_psql -v ON_ERROR_STOP=1 -U postgres -d acog \
  -c "DROP TABLE IF EXISTS $DROP_LIST CASCADE" >/dev/null

echo "[restore] applying dump to live $ENV db"
gunzip < "$TMP_DIR/dump.sql.gz" \
  | live_psql -v ON_ERROR_STOP=1 -U postgres -d acog >/dev/null

echo "[restore] verification (row counts in live $ENV db):"
echo "$VERIFY_SQL" \
  | live_psql -U postgres -d acog -At -F $'\t' \
  | awk -F'\t' '{ printf "  %-22s %s\n", $1, $2 }'

echo "[restore] real restore complete"
echo "[restore] NOTE: CASCADE dropped FKs into the restored tables (matches.user_id,"
echo "[restore]       refresh_tokens.user_id, fcm_tokens.user_id). TypeORM will NOT"
echo "[restore]       auto-recreate them — see docs/recovery.md for the manual SQL."
echo "[restore] ok"
