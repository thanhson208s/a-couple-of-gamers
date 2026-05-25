#!/usr/bin/env bash
# Data-side recovery orchestrator. Run on acog-app (production) or acog-staging.
# Bundles the four steps that always run together for a restore-based recovery:
#
#   1. maintain start         — Caddy 503 for all public hosts.
#   2. shutdown               — graceful SIGTERM to app + worker + admin.
#   3. restore.sh --real      — scratch-verify, then overwrite the live db from R2.
#   4. flush                  — FLUSHDB on Redis (stale state would point at gone rows).
#
# After this exits, trigger the deploy workflow with the appropriate image_tag:
#   - Restore only:  the currently-running tag.
#   - Revert + restore: the rollback tag.
# The workflow brings app + worker + admin back up and exits maintenance via its caddy reload.
#
# Usage:
#   scripts/recovery.sh start --env=production --latest=daily
#   scripts/recovery.sh start --env=production --key=predeploy/v1.2.2-20260519T140000Z.sql.gz
#   scripts/recovery.sh start --env=staging    --latest=daily
#   scripts/recovery.sh stop  --env=production
#   scripts/recovery.sh stop  --env=staging

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  scripts/recovery.sh start --env=production|staging (--key=<path> | --latest=daily|predeploy)
  scripts/recovery.sh stop  --env=production|staging
EOF
}

COMMAND="${1:-}"
if [[ "$COMMAND" != "start" && "$COMMAND" != "stop" ]]; then
  usage
  exit 2
fi
shift

ENV=""
KEY=""
LATEST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env=*)    ENV="${1#*=}";    shift ;;
    --key=*)    KEY="${1#*=}";    shift ;;
    --latest=*) LATEST="${1#*=}"; shift ;;
    *) echo "[recovery] unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

[[ "$ENV" == "production" || "$ENV" == "staging" ]] || { echo "[recovery] --env=production|staging required" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$COMMAND" in
  start)
    if [[ -z "$KEY" && -z "$LATEST" ]] || [[ -n "$KEY" && -n "$LATEST" ]]; then
      echo "[recovery] exactly one of --key=<path> or --latest=daily|predeploy is required" >&2
      exit 2
    fi

    echo "[recovery] 1/4: enter maintenance"
    "$SCRIPT_DIR/maintain.sh" start

    echo "[recovery] 2/4: stop app + worker + admin"
    "$SCRIPT_DIR/shutdown.sh" --env="$ENV"

    echo "[recovery] 3/4: restore (scratch-verify, then live)"
    if [[ -n "$KEY" ]]; then
      "$SCRIPT_DIR/restore.sh" --env="$ENV" --key="$KEY" --real
    else
      "$SCRIPT_DIR/restore.sh" --env="$ENV" --latest="$LATEST" --real
    fi

    echo "[recovery] 4/4: flush Redis"
    "$SCRIPT_DIR/flush.sh" --env="$ENV"

    cat <<EOF

[recovery] Data-side recovery complete. Caddy is still serving 503; app + worker + admin stopped.

Next steps:
  1. Trigger the deploy workflow with the selected image_tag:
    gh workflow run deploy-${ENV}.yml -f image_tag=<TAG>

    The workflow will bring app + worker + admin back up
    and exit maintenance via its graceful caddy reload.

  2. Manually re-add FKs that CASCADE dropped.

  3. Smoke test before considering recovery complete.

EOF
    ;;

  stop)
    if [[ -n "$KEY" || -n "$LATEST" ]]; then
      echo "[recovery] stop does not accept --key or --latest" >&2
      exit 2
    fi

    echo "[recovery]: exit maintenance"
    "$SCRIPT_DIR/maintain.sh" stop
    ;;
esac
