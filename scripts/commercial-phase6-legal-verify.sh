#!/usr/bin/env bash
# Phase 6 — Legal counsel attestation verify (this Mac).
# Human gate: external counsel must review ToS v1.2 + DPA v1.1 before running.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COUNSEL="${1:-${LEGAL_COUNSEL_REVIEWED_BY:-}}"
SIGNED_BY="${2:-${LEGAL_SIGNED_BY:-$COUNSEL}}"
NOTE="${LEGAL_ATTEST_NOTE:-ToS v1.2 / DPA v1.1 counsel-reviewed}"

cd "$ROOT"

echo "--- Legal document preflight ---"
for doc in docs/product/legal/terms-of-service.md docs/product/legal/dpa.md; do
  if [[ ! -f "$doc" ]]; then
    echo "Missing $doc" >&2
    exit 1
  fi
  if grep -qE 'ドラフト|Counsel review pending|法務レビュー前' "$doc"; then
    echo "Draft marker found in $doc — fix before attestation" >&2
    exit 1
  fi
  echo "  ✓ $doc (no draft markers)"
done

if [[ -z "$COUNSEL" ]]; then
  echo "" >&2
  echo "Phase 6 blocked — counsel identity required." >&2
  echo "Usage: $0 <counsel-reviewed-by> [signed-by]" >&2
  echo "  Example: $0 counsel-yamada-legal" >&2
  echo "  Or: LEGAL_COUNSEL_REVIEWED_BY=counsel-yamada-legal $0" >&2
  exit 1
fi

npm run orgos -- ledger product legal-attest \
  --signed-by "$SIGNED_BY" \
  --counsel-reviewed-by "$COUNSEL" \
  --note "$NOTE"

npm run orgos -- ledger product readiness --commercial 2>&1 | grep -E "Commercial readiness|legal-signed"
