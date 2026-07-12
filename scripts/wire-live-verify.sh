#!/usr/bin/env bash
# Env-gated Wire live verification (Phase 3–4)
# Usage:
#   ORGOS_LIVE_VERIFY=1 ./scripts/wire-live-verify.sh [tenant]           # check only
#   ORGOS_LIVE_VERIFY=1 ORGOS_LIVE_VERIFY_ROUNDTRIP=1 ./scripts/wire-live-verify.sh mal live
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TENANT="${1:-mal}"
MODE="${2:-check}"
export ORGOS_TENANT="$TENANT"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.oorgos.org}"

if [[ "${ORGOS_LIVE_VERIFY:-}" != "1" ]]; then
  echo "✗ Set ORGOS_LIVE_VERIFY=1 to run live verification" >&2
  echo "  Example: ORGOS_LIVE_VERIFY=1 $0 $TENANT check" >&2
  exit 1
fi

echo "=== Wire live verify ($TENANT · $MODE) ==="
pkill -9 -f 'node.*vitest' 2>/dev/null || true

MAIL_CFG="$ROOT/tenants/$TENANT/records/executive/mail-config.yaml"
MAIL_EXAMPLE="$ROOT/tenants/$TENANT/records/executive/mail-config.mal-pilot.yaml.example"
if [[ ! -f "$MAIL_CFG" ]] && [[ -f "$MAIL_EXAMPLE" ]]; then
  cp "$MAIL_EXAMPLE" "$MAIL_CFG"
  echo "✓ Restored $MAIL_CFG from mal-pilot example"
fi

# Load L2 mail credentials when present (names only in logs)
for f in \
  "$ROOT/tenants/$TENANT/records/executive/smtp.env" \
  "$ROOT/deploy/mal-pilot/env/.env.mail-wire"; do
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
  fi
done

ROUNDTRIP=false
if [[ "$MODE" == "live" ]] || [[ "${ORGOS_LIVE_VERIFY_ROUNDTRIP:-}" == "1" ]]; then
  ROUNDTRIP=true
fi

ARGS=(--tenant "$TENANT" --public-base-url "$PUBLIC_BASE_URL")
if [[ "$ROUNDTRIP" == true ]]; then
  ARGS+=(--roundtrip)
fi

npm run orgos -- wire live-verify "${ARGS[@]}"

echo ""
echo "✓ Wire live verify complete"
