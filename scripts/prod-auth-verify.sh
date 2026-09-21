#!/usr/bin/env bash
# Verify production auth checklist for one managed customer.
# Usage: ./scripts/prod-auth-verify.sh <customer-id>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CUSTOMER="${1:-}"
if [[ -z "$CUSTOMER" ]]; then
  echo "usage: $0 <customer-id>" >&2
  exit 2
fi

ENV_FILE="$ROOT/deploy/customers/$CUSTOMER/production.env"
EXAMPLE="$ROOT/deploy/customers/$CUSTOMER/production.env.example"
TEMPLATE="$ROOT/deploy/customers/_template/production.env.example"
EVIDENCE_DIR="$ROOT/deploy/customers/$CUSTOMER/verify-evidence"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  if [[ -f "$EXAMPLE" ]]; then
    echo "copy from $EXAMPLE and fill secrets (gitignored)." >&2
  else
    echo "copy from $TEMPLATE and fill secrets (gitignored)." >&2
  fi
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export ORGOS_ENV=production
mkdir -p "$EVIDENCE_DIR"
OUT="$EVIDENCE_DIR/prod-auth-$STAMP.txt"

{
  echo "# prod-auth-verify customer=$CUSTOMER at $STAMP"
  echo "ORGOS_ENV=$ORGOS_ENV"
  echo "ORGOS_TENANT=${ORGOS_TENANT:-}"
  echo "ORGOS_MCP_TOKEN set: $([[ -n "${ORGOS_MCP_TOKEN:-}" ]] && echo yes || echo NO)"
  echo "ORGOS_MAIL_SMTP_URL set: $([[ -n "${ORGOS_MAIL_SMTP_URL:-}" ]] && echo yes || echo NO)"
  echo
  cd "$ROOT"
  npm run orgos -- doctor
} | tee "$OUT"

if [[ -z "${ORGOS_MCP_TOKEN:-}" ]]; then
  echo "ORGOS_MCP_TOKEN is required for production MCP" >&2
  exit 1
fi
if [[ "${ORGOS_MCP_AUTH:-}" == "0" ]]; then
  echo "ORGOS_MCP_AUTH=0 is forbidden for commercial production" >&2
  exit 1
fi

echo "✓ evidence → $OUT"
