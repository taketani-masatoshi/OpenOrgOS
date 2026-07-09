#!/usr/bin/env bash
# Open GitHub Package settings to set orgos-demo Public (one-time · UI only).
# API cannot change GHCR visibility — see deploy/demo/PUBLISH.md §2
set -euo pipefail

URL="https://github.com/users/taketani-masatoshi/packages/container/package/orgos-demo/settings"

echo "OrgOS Demo — make GHCR package Public (one-time)"
echo ""
echo "1. Open: $URL"
echo "2. Danger Zone → Change package visibility → Public"
echo "3. Confirm package name: orgos-demo"
echo ""
echo "Then verify anonymous pull:"
echo "  docker logout ghcr.io 2>/dev/null || true"
echo "  docker pull ghcr.io/taketani-masatoshi/orgos-demo:main"
echo ""

if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "(Open the URL manually in your browser.)"
fi
