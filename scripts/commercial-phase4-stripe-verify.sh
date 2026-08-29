#!/usr/bin/env bash
# Phase 4 — Stripe live verify (this Mac). Secrets stay in production.env (gitignored).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/deploy/operator-console/env/production.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from production.env.example" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
unset ORGOS_ENV

missing=()
[[ -z "${STRIPE_SECRET_KEY:-}" ]] && missing+=("STRIPE_SECRET_KEY")
[[ -z "${STRIPE_WEBHOOK_SECRET:-}" ]] && missing+=("STRIPE_WEBHOOK_SECRET")
if ((${#missing[@]} > 0)); then
  echo "Phase 4 blocked — set in $ENV_FILE:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo "  Stripe Dashboard → API keys (sk_live_…) + Webhook signing secret (whsec_…)" >&2
  echo "  Webhook URL: https://operator.oorgos.org/chat/v1/product/stripe/webhook" >&2
  exit 1
fi

if [[ "${STRIPE_SECRET_KEY}" != sk_live_* ]]; then
  echo "WARN: STRIPE_SECRET_KEY is not sk_live_* — commercial policy 2-A expects live mode" >&2
fi

cd "$ROOT"
npm run orgos -- ledger product stripe-status --json
npm run orgos -- ledger product stripe-attest --note "Phase 4 verify $(date -u +%Y-%m-%d)"
npm run orgos -- ledger product readiness --commercial | grep -E "Commercial readiness|stripe-live|stripe-lifecycle"
