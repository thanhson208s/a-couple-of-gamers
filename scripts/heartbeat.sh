#!/usr/bin/env bash
# Push uptime heartbeat.
# Usage:
#   scripts/heartbeat.sh --env=production
#   scripts/heartbeat.sh --env=staging

set -euo pipefail

ENV=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env=*) ENV="${1#*=}"; shift ;;
    *) echo "[heartbeat] unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ "$ENV" == "production" || "$ENV" == "staging" ]] || { echo "[heartbeat] --env=production|staging required" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$ENV" == "production" ]]; then
  ENV_FILE="$REPO_ROOT/.env.production"
else
  ENV_FILE="$REPO_ROOT/.env.staging"
fi
[[ -f "$ENV_FILE" ]] || { echo "[heartbeat] env file not found: $ENV_FILE" >&2; exit 2; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${HEARTBEAT_ACCESS_CLIENT_ID:?HEARTBEAT_ACCESS_CLIENT_ID not set in $ENV_FILE}"
: "${HEARTBEAT_ACCESS_CLIENT_SECRET:?HEARTBEAT_ACCESS_CLIENT_SECRET not set in $ENV_FILE}"
: "${HEARTBEAT_PUSH_URL:?HEARTBEAT_PUSH_URL not set in $ENV_FILE}"

curl -fsSL \
  -H "CF-Access-Client-Id: ${HEARTBEAT_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${HEARTBEAT_ACCESS_CLIENT_SECRET}" \
  "${HEARTBEAT_PUSH_URL}?status=up&msg=OK" \
  >/dev/null

echo "[heartbeat] pushed ($ENV)"
