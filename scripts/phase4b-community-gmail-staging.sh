#!/usr/bin/env bash
# Phase 4b staging — Community tenant-mail connect (feature flag temporary ON)
# Usage:
#   ./scripts/phase4b-community-gmail-staging.sh check   # flag/env readiness only
#   ./scripts/phase4b-community-gmail-staging.sh e2e     # Steward bind + Community unit gates
#
# Does NOT set production COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED or integration.json true.
# Staging only — unset the flag after demo. See docs/org-os/gmail-ship-gate-checklist.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MODE="${1:-check}"
COMMUNITY_ROOT="${COMMUNITY_ROOT:-$ROOT/../OS_Community}"

echo "=== Phase 4b staging: Community Gmail (scaffold · not production ship) ==="

missing=0
for var in ORGOS_COMMUNITY_GOVERNANCE_TOKEN; do
  if [[ -z "${!var:-}" ]]; then
    echo "⚠ $var unset (required for live Steward push)"
    missing=1
  else
    echo "✓ $var set"
  fi
done

if [[ -z "${ORGOS_GMAIL_CLIENT_ID:-}${AUTH_GOOGLE_ID:-}" ]]; then
  echo "⚠ ORGOS_GMAIL_CLIENT_ID / AUTH_GOOGLE_ID unset (OAuth client for live connect)"
  missing=1
else
  echo "✓ Gmail OAuth client id present"
fi

if [[ ! -d "$COMMUNITY_ROOT/apps/web" ]]; then
  echo "✗ Community repo not found at $COMMUNITY_ROOT" >&2
  exit 1
fi
echo "✓ Community root: $COMMUNITY_ROOT"

echo ""
echo "=== Steward mock / unit gates ==="
npm test -- tests/protocol-community-tenant-mail-api.test.ts tests/mail-community-link.test.ts tests/community-gmail-connect-smoke.test.ts

echo ""
echo "=== Community ship-gate unit ==="
(cd "$COMMUNITY_ROOT" && npm test -w @os-community/web -- src/lib/orgos-mail-env.test.ts)

if [[ "$MODE" == "check" ]]; then
  echo ""
  echo "✓ Phase 4b check complete (production flags remain OFF)"
  echo "  Staging UI demo:"
  echo "    export COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1"
  echo "    # restart Community web, then:"
  echo "    ORGOS_TENANT=mal npm run orgos -- mail setup gmail --community-link --json"
  exit 0
fi

if [[ "$MODE" != "e2e" ]]; then
  echo "Usage: $0 [check|e2e]" >&2
  exit 2
fi

echo ""
echo "=== Phase 4b e2e: Steward community-link helpers (no Google browser) ==="
ORGOS_TENANT="${ORGOS_TENANT:-mal}" npm test -- tests/mail-community-link.test.ts tests/community-gmail-connect-smoke.test.ts tests/protocol-community-tenant-mail-api.test.ts

echo ""
echo "=== Community ship-gate + start-gate unit ==="
(cd "$COMMUNITY_ROOT" && npm test -w @os-community/web -- src/lib/orgos-mail-env.test.ts src/lib/orgos-mail-start-gate.test.ts)

echo ""
echo "✓ Phase 4b staging e2e (automated) complete"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EVIDENCE="$ROOT/scratch/phase4b-staging-automated-${STAMP//:/-}.json"
mkdir -p "$ROOT/scratch"
cat >"$EVIDENCE" <<EOF
{
  "kind": "phase4b_staging_automated",
  "recorded_at": "$STAMP",
  "browser_oauth": "pending_human",
  "automated_gates": "pass",
  "production_ship": false,
  "notes": "Steward community-link + Community ship-gate units green. Fill docs/org-os/phase4b-oauth-evidence.md.example after browser OAuth."
}
EOF
echo "  Automated evidence: $EVIDENCE"
echo "  Manual browser OAuth: docs/org-os/phase4b-oauth-evidence.md.example"
echo "  Do NOT set publish/protocol/community-integration.json tenant_mail_connect_*: true"
echo "  until Phase 5 CEO approval (scripts/mal-ship-gate-apply.sh)."
