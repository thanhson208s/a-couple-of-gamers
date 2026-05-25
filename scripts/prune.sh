#!/usr/bin/env bash
# Prune R2 backups.
# Usage:
#   scripts/prune.sh --env=production --mode=daily
#   scripts/prune.sh --env=production --mode=predeploy
#   scripts/prune.sh --env=staging    --mode=daily
#   scripts/prune.sh --env=staging    --mode=predeploy
#
# Retention rules:
#   prod daily      : keep if (age <= 7 days) OR (file is Sunday AND among 4 most recent Sundays).
#   prod predeploy  : keep if (age <= 7 days) AND (among 5 most recent).
#   staging *       : keep the single most recent file.

set -euo pipefail

ENV=""
MODE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env=*)  ENV="${1#*=}";  shift ;;
    --mode=*) MODE="${1#*=}"; shift ;;
    *) echo "[prune] unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$ENV"  == "production" || "$ENV"  == "staging" ]] || { echo "[prune] --env=production|staging required" >&2; exit 2; }
[[ "$MODE" == "daily" || "$MODE" == "predeploy" ]] || { echo "[prune] --mode=daily|predeploy required" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ "$ENV" == "production" ]]; then
  ENV_FILE="$REPO_ROOT/.env.production"
else
  ENV_FILE="$REPO_ROOT/.env.staging"
fi
[[ -f "$ENV_FILE" ]] || { echo "[prune] env file not found: $ENV_FILE" >&2; exit 2; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${R2_BACKUP_BUCKET:?R2_BACKUP_BUCKET not set in $ENV_FILE}"
: "${R2_BACKUP_ACCESS_KEY_ID:?R2_BACKUP_ACCESS_KEY_ID not set in $ENV_FILE}"
: "${R2_BACKUP_SECRET_ACCESS_KEY:?R2_BACKUP_SECRET_ACCESS_KEY not set in $ENV_FILE}"
: "${R2_BACKUP_ENDPOINT:?R2_BACKUP_ENDPOINT not set in $ENV_FILE}"

# rclone reads its config from RCLONE_CONFIG_<remote>_* env vars; map our names onto the
# "r2:" remote.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_BACKUP_ENDPOINT"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

REMOTE="r2:${R2_BACKUP_BUCKET}/${MODE}"

LISTING="$(docker run --rm \
  -e RCLONE_CONFIG_R2_TYPE \
  -e RCLONE_CONFIG_R2_PROVIDER \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID \
  -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_ENDPOINT \
  -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
  rclone/rclone \
  lsjson --recursive --files-only "$REMOTE" 2>/dev/null || echo "[]")"

if [[ -z "$LISTING" || "$LISTING" == "[]" ]]; then
  echo "[prune] nothing to prune at $REMOTE"
  exit 0
fi

# Decide which paths to delete in Python — easier date handling than bash.
DELETE_PATHS="$(LISTING="$LISTING" ENV="$ENV" MODE="$MODE" python3 <<'PYEOF'
import json, os, sys, datetime, re

data = json.loads(os.environ["LISTING"])
env = os.environ["ENV"]
mode = os.environ["MODE"]
now = datetime.datetime.now(datetime.timezone.utc)
seven_days = datetime.timedelta(days=7)

files = []
for e in data:
    if e.get("IsDir"):
        continue
    mt = datetime.datetime.fromisoformat(re.sub(r'(\.\d{6})\d+', r'\1', e["ModTime"].replace("Z", "+00:00")))
    files.append((e["Path"], mt))

keep = set()

if env == "staging":
    # Keep the single most recent file, regardless of age.
    by_mtime = sorted(files, key=lambda x: x[1], reverse=True)
    if by_mtime:
        keep.add(by_mtime[0][0])
elif mode == "predeploy":
    # Intersection: age <= 7d AND among 5 most recent.
    by_mtime = sorted(files, key=lambda x: x[1], reverse=True)
    for i, (path, mt) in enumerate(by_mtime):
        if i < 5 and (now - mt) <= seven_days:
            keep.add(path)
elif mode == "daily":
    # Union: age <= 7d OR (Sunday AND among 4 most recent Sundays).
    for path, mt in files:
        if (now - mt) <= seven_days:
            keep.add(path)
    sundays = sorted(
        [(path, mt) for path, mt in files if mt.weekday() == 6],
        key=lambda x: x[1],
        reverse=True,
    )
    for path, _ in sundays[:4]:
        keep.add(path)

for path, _ in files:
    if path not in keep:
        print(path)
PYEOF
)"

if [[ -z "$DELETE_PATHS" ]]; then
  echo "[prune] nothing to delete at $REMOTE"
  exit 0
fi

echo "[prune] deleting from $REMOTE:"
echo "$DELETE_PATHS" | sed 's/^/  /'

TMP_LIST="$(mktemp -t acog-prune.XXXXXX)"
trap 'rm -f "$TMP_LIST"' EXIT
printf '%s\n' "$DELETE_PATHS" > "$TMP_LIST"

docker run --rm \
  -v "$TMP_LIST":/files.txt:ro \
  -e RCLONE_CONFIG_R2_TYPE \
  -e RCLONE_CONFIG_R2_PROVIDER \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID \
  -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_ENDPOINT \
  -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
  rclone/rclone \
  delete --files-from /files.txt "$REMOTE"

echo "[prune] done"
