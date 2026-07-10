#!/usr/bin/env bash
# Wire/Gov/Trust production gate — mal pilot reference
# Usage: ./scripts/prod-validate-wire.sh [tenant]
set -euo pipefail
TENANT="${1:-mal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ORGOS_TENANT="$TENANT"
export WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY="${WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY:-1}"
export ORGOS_STRICT_TRUST_JURISDICTIONS="${ORGOS_STRICT_TRUST_JURISDICTIONS:-JP}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.${TENANT}.example}"

echo "=== Wire production gate (${TENANT}) ==="

fail() {
  echo "✗ Wire production gate failed: $*" >&2
  exit 1
}

ORGOS_STRICT_TRUST=1 npm run orgos -- protocol trust-registry validate || fail "protocol trust-registry validate"
ORGOS_STRICT_TRUST=1 npm run orgos -- protocol trusted-hubs-validate || fail "protocol trusted-hubs-validate"
ORGOS_STRICT_TLS=1 npm run orgos -- wire-gateway validate --tenant "$TENANT" || fail "wire-gateway validate"
ORGOS_STRICT_TRANSPORT=1 npm run orgos -- protocol validate --tenant "$TENANT" || fail "protocol validate"
GOV_GATEWAY_TRANSPORT="${GOV_GATEWAY_TRANSPORT:-live}" npm run orgos -- protocol gov-gateway validate --tenant "$TENANT" || fail "protocol gov-gateway validate"

npm run orgos -- doctor --wire-prod --tenant "$TENANT" || fail "doctor --wire-prod"

echo "✓ All wire production gates passed"
