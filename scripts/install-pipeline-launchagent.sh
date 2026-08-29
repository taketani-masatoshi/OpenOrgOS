#!/usr/bin/env zsh
# Install weekly/monthly records_audit pipeline LaunchAgents (macOS).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/bin:/bin:${PATH:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TENANT="${1:-mal}"
LAUNCHD="${HOME}/Library/LaunchAgents"

chmod +x "${ROOT}/scripts/pipeline-weekly.sh" "${ROOT}/scripts/pipeline-monthly.sh"

install_plist() {
  local src="$1" label="$2"
  sed "s|/Users/kk/OS_Steward|${ROOT}|g" "$src" \
    | sed "s|<string>mal</string>|<string>${TENANT}</string>|g" \
    > "${LAUNCHD}/${label}.plist"
  launchctl bootout "gui/$(id -u)/${label}" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "${LAUNCHD}/${label}.plist"
  echo "✓ loaded ${label} (tenant=${TENANT})"
}

mkdir -p "$LAUNCHD"
install_plist "${ROOT}/deploy/launchd/com.openorgos.pipeline-weekly.plist" "com.openorgos.pipeline-weekly"
install_plist "${ROOT}/deploy/launchd/com.openorgos.pipeline-monthly.plist" "com.openorgos.pipeline-monthly"

echo ""
echo "Operator auth: STEWARD_OPERATOR_AUTH=1 · ORGOS_CLI_OPERATOR_ID=OP-001"
echo "  Key: ~/.orgos/operators/OP-001.key (auto-loaded by pipeline scripts)"
echo "  Optional override: tenants/${TENANT}/.env.operator"
echo "Logs: /tmp/orgos-pipeline-weekly-${TENANT}.log · /tmp/orgos-pipeline-monthly-${TENANT}.log"
