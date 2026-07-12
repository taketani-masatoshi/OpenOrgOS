#!/usr/bin/env bash
# Install / reload MAL Today digest launchd (daily 9:00 / 13:00 / 17:00 JST)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
SRC="$ROOT/tenants/mal/docs/executive/launchd-com.steward.mal-today-digest.plist.example"
DEST="$HOME/Library/LaunchAgents/com.steward.mal-today-digest.plist"
LABEL="com.steward.mal-today-digest"

if [[ ! -f "$SRC" ]]; then
  echo "✗ missing $SRC" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cp "$SRC" "$DEST"
chmod +x "$ROOT/tenants/mal/docs/executive/scripts/orgos-today-digest.sh"

# unload if present (ignore errors)
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl unload "$DEST" 2>/dev/null || true

if launchctl bootstrap "gui/$(id -u)" "$DEST" 2>/dev/null; then
  echo "✓ launchctl bootstrap $LABEL"
elif launchctl load "$DEST" 2>/dev/null; then
  echo "✓ launchctl load $LABEL"
else
  echo "✗ failed to load $DEST" >&2
  exit 1
fi

echo "✓ installed $DEST"
echo "  times: daily 09:00 / 13:00 / 17:00 (system local TZ · set Mac to JST)"
echo "  output: tenants/mal/docs/reports/dashboard/today-digest/latest.md"
echo "  log: /tmp/orgos-mal-today-digest.log"
echo ""
echo "手動テスト:"
echo "  bash $ROOT/tenants/mal/docs/executive/scripts/orgos-today-digest.sh"
echo "確認:"
echo "  launchctl print gui/$(id -u)/$LABEL 2>/dev/null | head -20 || launchctl list | grep mal-today"
