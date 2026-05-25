#!/usr/bin/env bash
# Swap Caddy between the normal config and the maintenance 503 config.
# Only touches the proxy container — does NOT stop/start app or worker.
# If you need those stopped too, do it explicitly with `docker compose stop`.
#
# Usage:
#   scripts/maintain.sh start    # swap to Caddyfile.maintenance (all public hosts 503)
#   scripts/maintain.sh stop     # swap back to the bind-mounted Caddyfile (Caddyfile.production / .staging)
#
# Run on the host where the proxy container lives (acog-app / acog-staging).
# Idempotent: re-running start or stop is harmless.

set -euo pipefail

CMD="${1:-}"
case "$CMD" in
  start|stop) ;;
  *) echo "[maintain] usage: maintain.sh start|stop" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROXY_CONTAINER="acog-proxy-1"
MAINTENANCE_FILE="$REPO_ROOT/Caddyfile.maintenance"

if ! docker ps --format '{{.Names}}' | grep -qx "$PROXY_CONTAINER"; then
  echo "[maintain] proxy container '$PROXY_CONTAINER' is not running on this host" >&2
  echo "[maintain] run this on the VPS where the proxy lives (acog-app / acog-staging)" >&2
  exit 1
fi

case "$CMD" in
  start)
    [[ -f "$MAINTENANCE_FILE" ]] || { echo "[maintain] $MAINTENANCE_FILE not found" >&2; exit 1; }

    # The Caddyfile mount at /etc/caddy/Caddyfile is :ro, but we can write a sibling
    # file onto the container's overlay filesystem and reload Caddy onto it.
    docker cp "$MAINTENANCE_FILE" "${PROXY_CONTAINER}:/etc/caddy/Caddyfile.maintenance"
    docker exec "$PROXY_CONTAINER" \
      caddy reload --config /etc/caddy/Caddyfile.maintenance --adapter caddyfile

    echo "[maintain] Caddy now serving maintenance config (all public hosts 503)"
    ;;

  stop)
    # Reload from the bind-mounted Caddyfile (Caddyfile.production on acog-app,
    # Caddyfile.staging on acog-staging — Docker mounts whichever is appropriate).
    docker exec "$PROXY_CONTAINER" \
      caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

    echo "[maintain] Caddy back to normal config"
    ;;
esac
