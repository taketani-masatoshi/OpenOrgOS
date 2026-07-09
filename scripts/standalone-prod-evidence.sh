#!/usr/bin/env bash
# Collect standalone / outbox production evidence for strict scoring (O2).
# Usage: ./scripts/standalone-prod-evidence.sh [tenant]
set -euo pipefail
TENANT="${1:-mal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${ROOT}/scratch/standalone-prod-evidence-${TENANT}.txt"
mkdir -p "$(dirname "$OUT")"

{
  echo "# Standalone production evidence — $TENANT"
  echo "generated_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo ""
  echo "## validate"
  npm run orgos -- --tenant "$TENANT" validate 2>&1 || true
  echo ""
  echo "## protocol validate"
  npm run orgos -- --tenant "$TENANT" protocol validate 2>&1 || true
  echo ""
  echo "## wire prod gate"
  WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
    PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.${TENANT}.example}" \
    npm run orgos -- --tenant "$TENANT" doctor --wire-prod 2>&1 || true
  echo ""
  echo "## relay status"
  npm run orgos -- --tenant "$TENANT" protocol relay status 2>&1 || true
} | tee "$OUT"

echo "✓ Evidence written: $OUT"
