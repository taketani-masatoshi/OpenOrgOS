#!/usr/bin/env bash
# Wire implementation eval loop — static checklist only (NOT live / NOT --strict runtime)
#
# IMPORTANT:
#   evaluateWireImplementationScore() === evaluateWireImplementationChecklist()
#   This loop does NOT prove SMTP/IMAP live, prod gate, or Vitest --strict evidence.
#   For runtime: npm run orgos -- wire-gateway score --strict
#   For live:    ORGOS_LIVE_VERIFY=1 ./scripts/wire-live-verify.sh mal check
#
# Target 98/100 on the static checklist for regression hunting only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TARGET=98
LOOPS=10

echo "=== Wire implementation eval loop (STATIC checklist, target ${TARGET}/100) ==="
echo "  Note: not a live or --strict runtime score"

for i in $(seq 1 "$LOOPS"); do
  echo ""
  echo "--- Loop ${i}/${LOOPS} ---"
  read -r TOTAL GRADE GAPS < <(npx tsx -e "
    import { evaluateWireImplementationScore } from './src/lib/protocol/wire-implementation-score.ts';
    const s = evaluateWireImplementationScore();
    const gaps = s.items.filter(i => !i.ok).map(i => i.id + ':' + (i.detail ?? '')).join('|');
    console.log(s.total + ' ' + s.grade + ' ' + gaps);
  ")
  echo "Score: ${TOTAL}/100 (${GRADE})"
  if [ -n "$GAPS" ]; then
    echo "Gaps: ${GAPS}"
  fi
  if [ "$TOTAL" -ge "$TARGET" ]; then
    echo "✓ Target ${TARGET} reached on loop ${i}"
    npm test -- tests/openorg-dns.test.ts tests/wire-federation-gossip.test.ts tests/wire-pending-retry.test.ts tests/wire-pending-flush-e2e.test.ts tests/wire-implementation-score.test.ts tests/wire-gateway-server.test.ts tests/org-cert-witness.test.ts tests/protocol-multipath.test.ts 2>&1 | tail -8
    exit 0
  fi
done

echo "✗ Target ${TARGET} not reached after ${LOOPS} loops"
exit 1
