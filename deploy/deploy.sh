#!/usr/bin/env bash
# Sync this project to the server and run the remote build. Re-run any time you
# want to ship an update — it's idempotent (never touches .env, APP_KEY, or the
# database beyond running new migrations).
#
# First time: see deploy/README.md — you'll need to run this once (it syncs the
# code), then deploy/provision.sh on the server (installs everything), then this
# again (builds and starts it).
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="deploy/config.sh"
if [ ! -f "$CONFIG" ]; then
  echo "Missing $CONFIG — copy deploy/config.sh.example to $CONFIG and fill in your values." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG"
: "${REMOTE:?}" "${REMOTE_PATH:?}" "${DOMAIN:?}"

echo "==> Syncing project to $REMOTE:$REMOTE_PATH"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'deploy/config.sh' \
  --exclude 'backend/vendor' \
  --exclude 'backend/node_modules' \
  --exclude 'backend/.env' \
  --exclude 'backend/database/*.sqlite' \
  --exclude 'backend/storage/logs' \
  --exclude 'backend/storage/framework/cache' \
  --exclude 'backend/storage/framework/sessions' \
  --exclude 'backend/storage/framework/views' \
  --exclude 'backend/bootstrap/cache/*.php' \
  --exclude 'pantry-mcp/node_modules' \
  --exclude 'pantry-mcp/dist' \
  --exclude 'pantry-mcp/mcp-config.local.json' \
  --exclude 'app/node_modules' \
  --exclude 'app/dist' \
  --exclude 'app/.expo' \
  ./ "$REMOTE:$REMOTE_PATH/"

echo "==> Running remote build"
# shellcheck disable=SC2029
ssh "$REMOTE" "REMOTE_PATH='$REMOTE_PATH' DOMAIN='$DOMAIN' bash '$REMOTE_PATH/deploy/remote-build.sh'"

echo
echo "==> Done. https://$DOMAIN"
echo "    (first request for a new domain can take a few seconds while Caddy"
echo "    finishes its Let's Encrypt handshake)"
