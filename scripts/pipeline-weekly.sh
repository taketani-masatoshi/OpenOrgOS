#!/usr/bin/env zsh
# Weekly OrgOS pipeline (records_audit attest). Requires events:write operator.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TENANT="${ORGOS_TENANT:-mal}"
LOG="/tmp/orgos-pipeline-weekly-${TENANT}.log"
ENV_FILE="${ROOT}/tenants/${TENANT}/.env.operator"
KEY_FILE="${HOME}/.orgos/operators/OP-001.key"

cd "$ROOT"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

export STEWARD_OPERATOR_AUTH="${STEWARD_OPERATOR_AUTH:-1}"
export ORGOS_CLI_OPERATOR_ID="${ORGOS_CLI_OPERATOR_ID:-OP-001}"
if [[ -z "${ORGOS_OPERATOR_KEY:-}" && -f "$KEY_FILE" ]]; then
  ORGOS_OPERATOR_KEY="$(tr -d '\n' <"$KEY_FILE")"
  export ORGOS_OPERATOR_KEY
fi

{
  echo "=== $(date -Iseconds) pipeline weekly tenant=${TENANT} ==="
  echo "operator_auth: STEWARD_OPERATOR_AUTH=${STEWARD_OPERATOR_AUTH} ORGOS_CLI_OPERATOR_ID=${ORGOS_CLI_OPERATOR_ID} key_loaded=$([[ -n "${ORGOS_OPERATOR_KEY:-}" ]] && echo yes || echo no)"
  ORGOS_TENANT="$TENANT" \
    STEWARD_OPERATOR_AUTH="$STEWARD_OPERATOR_AUTH" \
    ORGOS_CLI_OPERATOR_ID="$ORGOS_CLI_OPERATOR_ID" \
    ORGOS_OPERATOR_KEY="${ORGOS_OPERATOR_KEY:-}" \
    npm run orgos -- pipeline run weekly
} >>"$LOG" 2>&1
