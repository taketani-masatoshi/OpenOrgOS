#!/usr/bin/env bash
# Phase 5 — apply Gmail / email_wire ship gate AFTER CEO approval
# Usage:
#   ORGOS_CEO_SHIP_APPROVED=1 ./scripts/mal-ship-gate-apply.sh dry-run
#   ORGOS_CEO_SHIP_APPROVED=1 ./scripts/mal-ship-gate-apply.sh apply
#
# Refuses to mutate production flags without ORGOS_CEO_SHIP_APPROVED=1.
# See docs/org-os/gmail-ship-gate-checklist.md · ADR 0004
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MODE="${1:-dry-run}"
INTEGRATION="$ROOT/publish/protocol/community-integration.json"
ENV_EXAMPLE="$ROOT/deploy/mal-pilot/env/mal-ship-gate.env.example"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ "${ORGOS_CEO_SHIP_APPROVED:-}" != "1" ]]; then
  echo "✗ Refusing ship-gate apply — set ORGOS_CEO_SHIP_APPROVED=1 after CEO / approver sign-off" >&2
  echo "  Checklist: docs/org-os/gmail-ship-gate-checklist.md" >&2
  exit 1
fi

echo "=== Phase 5 ship gate ($MODE) · approved at env ORGOS_CEO_SHIP_APPROVED=1 ==="

if [[ ! -f "$INTEGRATION" ]]; then
  echo "✗ missing $INTEGRATION" >&2
  exit 1
fi

node -e "
const fs = require('fs');
const path = process.argv[1];
const mode = process.argv[2];
const stamp = process.argv[3];
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const next = {
  ...data,
  tenant_mail_connect_api: true,
  tenant_mail_connect_ui: true,
  tenant_mail_ship_approved_at: stamp,
};
console.log('planned tenant_mail_connect_api:', next.tenant_mail_connect_api);
console.log('planned tenant_mail_connect_ui:', next.tenant_mail_connect_ui);
if (mode === 'apply') {
  fs.writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
  console.log('✓ Wrote', path);
} else {
  console.log('dry-run — no write');
}
" "$INTEGRATION" "$MODE" "$STAMP"

echo ""
echo "=== Operator follow-ups (manual · production hosts) ==="
echo "1. Append to mal Wire Gateway env (from $ENV_EXAMPLE):"
echo "     ORGOS_EMAIL_WIRE_REQUIRED=1"
echo "2. Community production .env:"
echo "     COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1"
echo "3. Restart Wire Gateway + Community web"
echo "4. Verify:"
echo "     ORGOS_EMAIL_WIRE_REQUIRED=1 ./scripts/prod-validate-wire.sh mal"
echo "     orgos protocol community export"

if [[ "$MODE" == "apply" ]]; then
  echo ""
  echo "✓ integration.json flags set true — Community redeploy still required"
elif [[ "$MODE" != "dry-run" ]]; then
  echo "Usage: ORGOS_CEO_SHIP_APPROVED=1 $0 [dry-run|apply]" >&2
  exit 2
fi
