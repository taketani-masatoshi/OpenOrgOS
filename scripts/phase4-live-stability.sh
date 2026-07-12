#!/usr/bin/env bash
# Phase 4a stability — run live roundtrip N times (default 3)
# Usage: ./scripts/phase4-live-stability.sh [tenant] [count]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TENANT="${1:-mal}"
COUNT="${2:-3}"
export PHASE4_CLEANUP_LOOPBACK="${PHASE4_CLEANUP_LOOPBACK:-1}"

echo "=== Phase 4a stability: ${COUNT}× live (${TENANT}) ==="
ok=0
for i in $(seq 1 "$COUNT"); do
  echo ""
  echo "---------- run $i / $COUNT ----------"
  if ./scripts/phase4-mal-email-wire-live.sh "$TENANT" live; then
    ok=$((ok + 1))
    echo "✓ run $i PASS"
  else
    echo "✗ run $i FAIL" >&2
    echo "  passed $ok / $COUNT before failure" >&2
    exit 1
  fi
done

echo ""
echo "✓ Phase 4a stability: $ok / $COUNT PASS"
