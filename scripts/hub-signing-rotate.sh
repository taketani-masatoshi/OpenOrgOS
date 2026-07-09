#!/usr/bin/env bash
# Rotate org protocol signing key and pin trust registry (Hub/Wire ops).
# Usage: ./scripts/hub-signing-rotate.sh [tenant]
set -euo pipefail
TENANT="${1:-mal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Protocol signing rotate ($TENANT) ==="
npm run orgos -- --tenant "$TENANT" protocol signing rotate

echo ""
echo "=== Pin local key to trust registry ==="
npm run orgos -- protocol trust-registry pin-local --tenant "$TENANT" --force

echo ""
echo "=== Publish registry mirror ==="
./scripts/publish-protocol-registry.sh

echo ""
echo "✓ Hub/Wire signing rotate complete"
echo "  Operator: deploy publish/protocol/ to CDN · restart wire-gateway@$TENANT"
