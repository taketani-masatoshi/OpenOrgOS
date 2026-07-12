#!/usr/bin/env bash
# Opt-in scheduling live smoke — dry-run by default; set SCHEDULING_LIVE_SMTP=1 for real SMTP.
# Usage:
#   ./scripts/scheduling-live-smoke.sh [tenant]
#   SCHEDULING_LIVE_SMTP=1 ./scripts/scheduling-live-smoke.sh mal
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TENANT="${1:-sch-verify}"
export ORGOS_TENANT="$TENANT"
export STEWARD_OPERATOR_AUTH="${STEWARD_OPERATOR_AUTH:-1}"

if [[ -f "$HOME/.orgos/operators/OP-001.key" ]]; then
  export ORGOS_OPERATOR_KEY="${ORGOS_OPERATOR_KEY:-$(cat "$HOME/.orgos/operators/OP-001.key")}"
fi

rm -rf tests/.fixture-restore.lock 2>/dev/null || true

echo "== doctor --repair ($TENANT) =="
npm run orgos -- doctor --tenant "$TENANT" --repair

echo "== rehearsal --full (dry-run path) =="
npm run orgos -- executive scheduling rehearsal --full --tenant "$TENANT"

if [[ "${SCHEDULING_LIVE_SMTP:-}" == "1" ]]; then
  echo "== live SMTP note =="
  echo "Create a real case, propose, then:"
  echo "  orgos executive scheduling approve-send --id SCH-... --reviewed --no-dry-run --tenant $TENANT"
  echo "Receive: orgos mail intake sync && orgos executive scheduling auto-process --tenant $TENANT"
  echo "CEO: mail intake ceo answer  OR  Steward Chat approve with {\"reviewed\":true,\"send\":true,\"dry_run\":false}"
fi

echo "== validate =="
npm run orgos -- validate --tenant "$TENANT"
echo "✓ scheduling smoke OK ($TENANT)"
