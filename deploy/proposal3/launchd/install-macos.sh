#!/usr/bin/env bash
# Proposal 3 — macOS launchd install (Mac mini 当事者 / Org C)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAUNCHD="${HOME}/Library/LaunchAgents"
TENANT="${1:-mal}"

install_plist() {
  local src="$1" label="$2"
  sed "s|/opt/orgos-reference|${ROOT}|g" "$src" \
    | sed "s|com.steward.party-relay|com.steward.party-relay.${TENANT}|g" \
    | sed "s|<string>mal</string>|<string>${TENANT}</string>|g" \
    > "${LAUNCHD}/${label}.plist"
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "${LAUNCHD}/${label}.plist"
  echo "✓ loaded ${label}"
}

mkdir -p "$LAUNCHD"
if [[ "$TENANT" == "aiac" || "$TENANT" == "org-c" ]]; then
  install_plist "${ROOT}/deploy/proposal3/launchd/com.steward.org-c-api.plist" "com.steward.org-c-api"
else
  install_plist "${ROOT}/deploy/proposal3/launchd/com.steward.party-relay.plist" "com.steward.party-relay.${TENANT}"
fi

echo ""
echo "Logs: /tmp/steward-${TENANT}-*.log"
echo "24h 検証: npm run proposal3:daemon-smoke && launchctl list | grep steward"
