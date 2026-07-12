#!/usr/bin/env bash
# mal ship-gate dry-run — ORGOS_EMAIL_WIRE_REQUIRED=1 without changing systemd defaults.
# Parent: docs/org-os/gmail-ship-gate-checklist.md · ADR 0004
# Usage: ./scripts/mal-ship-gate-check.sh [tenant=mal]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TENANT="${1:-mal}"
cd "$ROOT"

export ORGOS_TENANT="$TENANT"
export ORGOS_EMAIL_WIRE_REQUIRED=1
export ORGOS_STRICT_TRUST="${ORGOS_STRICT_TRUST:-1}"
export ORGOS_REQUIRE_PK_DID="${ORGOS_REQUIRE_PK_DID:-1}"
export ORGOS_STRICT_TRUST_JURISDICTIONS="${ORGOS_STRICT_TRUST_JURISDICTIONS:-JP}"

echo "== mal ship-gate check (opt-in REQUIRED=1 · tenant=$TENANT) =="
echo "Note: does NOT write systemd env. CEO approval still required for production default."
echo

./scripts/prod-validate-wire.sh "$TENANT"
echo
echo "✓ prod-validate-wire PASS under ORGOS_EMAIL_WIRE_REQUIRED=1"
echo "Next: docs/org-os/gmail-ship-gate-checklist.md § CEO 承認ゲート"
