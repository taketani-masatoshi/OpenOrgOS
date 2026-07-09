#!/usr/bin/env bash
# Example cron: mirror publish/protocol/ to CDN (openorgos.org/protocol/).
# Install on VPS: crontab -e
#   0 */6 * * * /opt/orgos-reference/scripts/publish-protocol-cron.example.sh >> /var/log/orgos-protocol-publish.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

./scripts/publish-protocol-registry.sh

CDN_DEST="${ORGOS_PROTOCOL_CDN_DEST:-}"
if [[ -n "$CDN_DEST" && -d "$CDN_DEST" ]]; then
  rsync -av --delete "$ROOT/publish/protocol/" "$CDN_DEST/"
  echo "✓ rsync → $CDN_DEST"
else
  echo "Set ORGOS_PROTOCOL_CDN_DEST for CDN rsync (local mirror only)"
fi
