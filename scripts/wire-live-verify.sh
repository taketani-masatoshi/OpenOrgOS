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

# Stabilize signing key · gateway DID · mail-config · PEER-003 (no rotate)
if [[ -x "$ROOT/scripts/mal-wire-hygiene.sh" ]]; then
  "$ROOT/scripts/mal-wire-hygiene.sh" "$TENANT" || true
fi

MAIL_CFG="$ROOT/tenants/$TENANT/records/executive/mail-config.yaml"
MAIL_EXAMPLE="$ROOT/tenants/$TENANT/records/executive/mail-config.mal-pilot.yaml.example"
MAIL_EXAMPLE_DEPLOY="$ROOT/deploy/mal-pilot/mail-config.mal-pilot.yaml.example"
if [[ ! -f "$MAIL_CFG" ]]; then
  if [[ -f "$MAIL_EXAMPLE" ]]; then
    mkdir -p "$(dirname "$MAIL_CFG")"
    cp "$MAIL_EXAMPLE" "$MAIL_CFG"
    echo "✓ Restored $MAIL_CFG from mal-pilot example"
  elif [[ -f "$MAIL_EXAMPLE_DEPLOY" ]]; then
    mkdir -p "$(dirname "$MAIL_CFG")"
    cp "$MAIL_EXAMPLE_DEPLOY" "$MAIL_CFG"
    echo "✓ Restored $MAIL_CFG from deploy/mal-pilot example"
  fi
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
if [[ "${ORGOS_LIVE_VERIFY_STRICT_EMAIL:-}" == "1" ]] || [[ "${ORGOS_EMAIL_WIRE_REQUIRED:-}" == "1" ]]; then
  ARGS+=(--strict-email-wire)
fi

npm run orgos -- wire live-verify "${ARGS[@]}"

echo ""
echo "✓ Wire live verify complete"
