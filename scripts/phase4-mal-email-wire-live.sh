#!/usr/bin/env bash
# Phase 4 — MAL email_wire live (SMTP/IMAP + ingest)
# Usage:
#   ./scripts/phase4-mal-email-wire-live.sh check   # readiness only
#   ./scripts/phase4-mal-email-wire-live.sh live    # outbound + IMAP sync + wire scan
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TENANT="${1:-mal}"
MODE="${2:-check}"
export ORGOS_TENANT="$TENANT"
MAIL_ENV="$ROOT/deploy/mal-pilot/env/.env.mail-wire"
MAIL_ENV_EXAMPLE="$ROOT/deploy/mal-pilot/env/mail-wire-mal.env.example"
SMTP_ENV="$ROOT/tenants/$TENANT/records/executive/smtp.env"
ROOT_ENV="$ROOT/.env"
IMAP_ENV="$ROOT/tenants/$TENANT/records/executive/imap.env"
MAIL_CFG="$ROOT/tenants/$TENANT/records/executive/mail-config.yaml"
MAIL_EXAMPLE="$ROOT/tenants/$TENANT/records/executive/mail-config.mal-pilot.yaml.example"
MAIL_EXAMPLE_FALLBACK="$ROOT/tenants/$TENANT/records/executive/mail-config.yaml.example"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.oorgos.org}"

load_env_file() {
  local f="$1"
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
    echo "✓ Loaded $f"
  fi
}

load_env_file "$SMTP_ENV"
load_env_file "$MAIL_ENV"
load_env_file "$ROOT_ENV"
load_env_file "$IMAP_ENV"

if [[ ! -f "$MAIL_ENV" ]]; then
  echo "⚠ $MAIL_ENV missing"
  echo "  cp $MAIL_ENV_EXAMPLE $MAIL_ENV"
  echo "  # set ORGOS_SMTP_USER/PASSWORD + ORGOS_IMAP_USER/PASSWORD (ai@malkk.com only)"
fi

echo "=== Phase 4: stop Vitest ==="
pkill -9 -f 'node.*vitest' 2>/dev/null || true
sleep 1

echo ""
echo "=== Phase 4: Wire Gateway public health ==="
code="$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_BASE_URL/wire/v1/health" 2>/dev/null || echo 000)"
if [[ "$code" != "200" ]]; then
  echo "✗ $PUBLIC_BASE_URL/wire/v1/health → HTTP $code" >&2
  echo "  Run: ./scripts/phase2-mal-wire-live.sh $TENANT" >&2
  exit 1
fi
echo "✓ $PUBLIC_BASE_URL/wire/v1/health"

echo ""
echo "=== Phase 4: mail-config ==="
mkdir -p "$(dirname "$MAIL_CFG")"
if [[ ! -f "$MAIL_CFG" ]] || ! grep -q 'sync: imap' "$MAIL_CFG" 2>/dev/null; then
  if [[ -f "$MAIL_EXAMPLE" ]]; then
    cp "$MAIL_EXAMPLE" "$MAIL_CFG"
    echo "✓ Wrote $MAIL_CFG from mal-pilot example (Xserver + ai@malkk.com)"
  elif [[ -f "$MAIL_EXAMPLE_FALLBACK" ]]; then
    cp "$MAIL_EXAMPLE_FALLBACK" "$MAIL_CFG"
    echo "⚠ Created $MAIL_CFG from generic example — set receive.sync: imap for Phase 4"
  else
    echo "✗ mail-config.yaml missing and no example" >&2
    exit 1
  fi
else
  echo "✓ $MAIL_CFG exists (imap)"
fi

echo ""
echo "=== Phase 4: SMTP/IMAP credentials (names only) ==="
for var in ORGOS_SMTP_USER ORGOS_SMTP_PASSWORD ORGOS_IMAP_USER ORGOS_IMAP_PASSWORD; do
  if [[ -n "${!var:-}" ]]; then
    echo "✓ $var set"
  else
    echo "✗ $var missing"
  fi
done

echo ""
echo "=== Phase 4: email_wire readiness ==="
ORGOS_TENANT="$TENANT" node --import tsx -e "
import { setTenantId } from './src/lib/tenant.js';
import { evaluateEmailWireReadiness } from './src/lib/protocol/prod-wire-gate.js';
setTenantId(process.env.ORGOS_TENANT ?? 'mal');
const r = evaluateEmailWireReadiness(process.env.ORGOS_TENANT ?? 'mal');
if (!r.ok) {
  console.error('✗', r.detail);
  for (const i of r.issues ?? []) console.error('  -', i);
  process.exit(1);
}
console.log('✓', r.detail);
"

echo ""
echo "=== Phase 4: doctor wire-prod (email_wire blocking gate) ==="
WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
GOV_GATEWAY_TRANSPORT=mock \
ORGOS_EMAIL_WIRE_REQUIRED=1 \
  npm run orgos -- doctor --wire-prod --tenant "$TENANT"

if [[ "$MODE" != "live" ]]; then
  echo ""
  echo "✓ Phase 4 check complete"
  echo "  Live roundtrip: ./scripts/phase4-mal-email-wire-live.sh $TENANT live"
  exit 0
fi

echo ""
echo "=== Phase 4: live email_wire roundtrip ==="
ORGOS_TENANT="$TENANT" node --import tsx "$ROOT/scripts/phase4-mal-email-wire-roundtrip.ts"

echo ""
echo "✓ Phase 4 live complete"
