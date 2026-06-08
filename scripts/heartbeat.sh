#!/usr/bin/env bash
set -euo pipefail

source /opt/acog/.env.production

curl -fsSL \
  -H "CF-Access-Client-Id: ${HEARTBEAT_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${HEARTBEAT_ACCESS_CLIENT_SECRET}" \
  "${HEARTBEAT_PUSH_URL}?status=up&msg=OK" \
  >/dev/null