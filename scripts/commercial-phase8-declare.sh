#!/usr/bin/env bash
# Phase 8 — Commercial declaration record (CEO). Allows qualified declare when stripe-live deferred.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/deploy/operator-console/env/production.env"
DECLARED_BY="${1:-ceo}"
SCOPE="${COMMERCIAL_DECLARE_SCOPE:-qualified}"

cd "$ROOT"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  unset ORGOS_ENV
fi

READINESS="$(npm run orgos -- ledger product readiness --commercial 2>&1)"
SCORE="$(echo "$READINESS" | sed -n 's/^Commercial readiness: \([0-9]*\)\/.*/\1/p')"
FAILING_LIST="$(echo "$READINESS" | awk '/\[·\]/ {print $2}')"
FAILING="$(echo "$FAILING_LIST" | paste -sd, - 2>/dev/null || true)"
FAILING_YAML="$(echo "$FAILING_LIST" | sed '/^$/d' | sed 's/^/  - /')"

if [[ -z "$SCORE" ]]; then
  echo "Could not parse commercial readiness score" >&2
  exit 1
fi

if [[ "$SCOPE" == "full" && -n "$FAILING" ]]; then
  echo "Full declaration blocked — failing checks: $FAILING" >&2
  exit 1
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY="$(date -u +%Y-%m-%d)"
RECORD="${ROOT}/product-fleet/commercial-declaration.yaml"

cat > "$RECORD" <<EOF
version: 1
declared_at: ${NOW}
declared_by: ${DECLARED_BY}
scope: ${SCOPE}
commercial_readiness_score: ${SCORE}
excluded_checks:
${FAILING_YAML:-  - stripe-live}
checklist: docs/product/commercial-claim-checklist.md
runbook: docs/product/commercial-declaration-runbook.md
public_statement_ja: |
  OrgOS Ledger はマネージド単一テナントの法人向けクラウド会計です。電子帳簿は基本要件対応（優良要件は別オプション）。e-Tax 提出は含みません。
  セルフサーブ課金（Stripe live）は別途投入予定。現時点は招待制・契約ベースの提供とします。
note: Phase 8 qualified declaration ${TODAY} — stripe-live deferred by CEO
EOF

echo "✓ Wrote ${RECORD}"
echo ""
echo "Commercial readiness: ${SCORE}/100"
if [[ -n "$FAILING" ]]; then
  echo "Excluded (deferred): ${FAILING}"
fi
echo ""
echo "--- 対外文案（qualified）---"
awk '/public_statement_ja: \|/{f=1;next} /^note:/{f=0} f' "$RECORD"
