#!/usr/bin/env bash
# Install mal Wire Gateway + Protocol Relay systemd units (Top5 W-1/2)
# Usage: sudo ./scripts/install-mal-wire-systemd.sh [tenant]
set -euo pipefail
TENANT="${1:-mal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run with sudo: sudo $0 $TENANT" >&2
  exit 1
fi

mkdir -p /etc/steward
if [[ ! -f "/etc/steward/wire-gateway-${TENANT}.env" ]]; then
  cp "$ROOT/deploy/mal-pilot/env/wire-gateway-mal.env.example" "/etc/steward/wire-gateway-${TENANT}.env"
  echo "Created /etc/steward/wire-gateway-${TENANT}.env — edit PUBLIC_BASE_URL before start"
fi

cp "$ROOT/deploy/mal-pilot/systemd/steward-wire-gateway@.service" /etc/systemd/system/
cp "$ROOT/deploy/mal-pilot/systemd/steward-protocol-relay@.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable "steward-wire-gateway@${TENANT}"
systemctl enable "steward-protocol-relay@${TENANT}"
systemctl restart "steward-wire-gateway@${TENANT}"
systemctl restart "steward-protocol-relay@${TENANT}"

echo "✓ systemd enabled: steward-wire-gateway@${TENANT}, steward-protocol-relay@${TENANT}"
systemctl --no-pager status "steward-wire-gateway@${TENANT}" || true
