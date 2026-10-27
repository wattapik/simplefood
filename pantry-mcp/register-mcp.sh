#!/usr/bin/env bash
# Registers the pantry + cronometer MCP servers with Claude Code (user scope,
# available from any project) using the values in mcp-config.local.json.
#
# Regenerate that file any time by hitting GET /api/settings/mcp-config while
# logged in (or via the app's Settings > "Generate MCP config" > save the
# response to this path), then re-run this script — `claude mcp add` updates
# an existing entry of the same name in place.
set -euo pipefail

cd "$(dirname "$0")"
CONFIG_FILE="mcp-config.local.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Missing $CONFIG_FILE. Fetch it from GET /api/settings/mcp-config first." >&2
  exit 1
fi

python3 <<'PYEOF'
import json, subprocess, sys

with open("mcp-config.local.json") as f:
    config = json.load(f)

for name, server in config["mcpServers"].items():
    env = {k: v for k, v in server.get("env", {}).items() if v}
    if not env and server.get("env"):
        print(f"Skipping '{name}': no env values are set yet (not configured in the app).", file=sys.stderr)
        continue

    # `claude mcp add` errors if the name already exists, so remove any prior
    # registration first (ignore failure — it may not exist yet).
    subprocess.run(["claude", "mcp", "remove", name, "--scope", "user"], capture_output=True)

    cmd = ["claude", "mcp", "add", name, "--scope", "user"]
    for key, value in env.items():
        cmd += ["-e", f"{key}={value}"]
    cmd += ["--", server["command"], *server["args"]]

    print(f"Registering '{name}'...")
    subprocess.run(cmd, check=True)
PYEOF

echo
echo "Done. Run 'claude mcp list' to verify, or '/mcp' inside a Claude Code session."
