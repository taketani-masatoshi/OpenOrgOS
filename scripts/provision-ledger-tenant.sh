#!/usr/bin/env bash
# Provision a managed OrgOS Ledger tenant (P1 ops script)
set -euo pipefail

CUSTOMER_ID="${1:-}"
COMPANY_NAME="${2:-}"
ADMIN_EMAIL="${3:-}"
PLAN="${4:-starter}"

if [[ -z "$CUSTOMER_ID" || -z "$COMPANY_NAME" || -z "$ADMIN_EMAIL" ]]; then
  echo "Usage: $0 <tenant-id> <company-name> <admin-email> [plan]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run orgos -- ledger product provision \
  --tenant-id "$CUSTOMER_ID" \
  --company "$COMPANY_NAME" \
  --email "$ADMIN_EMAIL" \
  --plan "$PLAN"

ORGOS_TENANT="$CUSTOMER_ID" npm run orgos -- operator init-registry
ORGOS_TENANT="$CUSTOMER_ID" npm run orgos -- validate

echo ""
echo "Next:"
echo "  export ORGOS_TENANT=$CUSTOMER_ID"
echo "  export LEDGER_DATA=$ROOT/tenants/$CUSTOMER_ID"
echo "  cd deploy/product && docker compose -f docker-compose.ledger.yaml up -d"
