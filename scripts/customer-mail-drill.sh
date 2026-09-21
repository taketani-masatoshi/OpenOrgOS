#!/usr/bin/env bash
# Per-customer SMTP mail drill. Records customer_id on product-fleet/mail-outbox.yaml.
# Usage: ./scripts/customer-mail-drill.sh <customer-id> <to-email>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CUSTOMER="${1:-}"
TO="${2:-}"
if [[ -z "$CUSTOMER" || -z "$TO" ]]; then
  echo "usage: $0 <customer-id> <to-email>" >&2
  exit 2
fi

ENV_FILE="$ROOT/deploy/customers/$CUSTOMER/production.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${ORGOS_MAIL_SMTP_URL:-}" ]]; then
  echo "ORGOS_MAIL_SMTP_URL unset — set it in $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT"
npm run orgos -- ledger product mail-drill --to "$TO" --customer "$CUSTOMER"
echo "✓ SMTP drill recorded for customer=$CUSTOMER"
