#!/usr/bin/env bash
# Phase 5 — SMTP mail-drill verify (this Mac).
# Uses ORGOS_MAIL_SMTP_URL or builds from deploy/mal-pilot/env/.env.mail-wire (L2, gitignored).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/deploy/operator-console/env/production.env"
MAIL_WIRE="${ROOT}/deploy/mal-pilot/env/.env.mail-wire"
TO="${1:-}"

build_smtp_url_from_parts() {
  ORGOS_SMTP_USER="${ORGOS_SMTP_USER:-}" \
  ORGOS_SMTP_PASSWORD="${ORGOS_SMTP_PASSWORD:-}" \
  ORGOS_SMTP_HOST="${ORGOS_SMTP_HOST:-}" \
  ORGOS_SMTP_PORT="${ORGOS_SMTP_PORT:-587}" \
  ORGOS_SMTP_SECURE="${ORGOS_SMTP_SECURE:-false}" \
  node --input-type=module -e "
const user = process.env.ORGOS_SMTP_USER ?? '';
const pass = process.env.ORGOS_SMTP_PASSWORD ?? '';
const host = process.env.ORGOS_SMTP_HOST ?? '';
const port = process.env.ORGOS_SMTP_PORT ?? '587';
const secure = process.env.ORGOS_SMTP_SECURE === 'true';
if (!user || !pass || !host) process.exit(2);
const proto = secure ? 'smtps' : 'smtp';
process.stdout.write(
  \`\${proto}://\${encodeURIComponent(user)}:\${encodeURIComponent(pass)}@\${host}:\${port}\`,
);
"
}

write_mail_smtp_url_to_production_env() {
  local url="$1"
  BUILT_URL="$url" node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[1];
const url = process.env.BUILT_URL ?? '';
let text = readFileSync(path, 'utf8');
if (/^ORGOS_MAIL_SMTP_URL=/m.test(text)) {
  text = text.replace(/^ORGOS_MAIL_SMTP_URL=.*/m, 'ORGOS_MAIL_SMTP_URL=' + url);
} else {
  text += (text.endsWith('\\n') ? '' : '\\n') + 'ORGOS_MAIL_SMTP_URL=' + url + '\\n';
}
writeFileSync(path, text);
" "$ENV_FILE"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
unset ORGOS_ENV

if [[ -z "${ORGOS_MAIL_SMTP_URL:-}${ORGOS_LEDGER_SMTP_URL:-}" ]] && [[ -f "$MAIL_WIRE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$MAIL_WIRE"
  set +a
  if BUILT="$(build_smtp_url_from_parts 2>/dev/null)"; then
    export ORGOS_MAIL_SMTP_URL="$BUILT"
    write_mail_smtp_url_to_production_env "$BUILT"
    echo "ORGOS_MAIL_SMTP_URL built from .env.mail-wire → production.env"
  fi
fi

if [[ -z "${ORGOS_MAIL_SMTP_URL:-}${ORGOS_LEDGER_SMTP_URL:-}" ]]; then
  echo "Phase 5 blocked — set ORGOS_MAIL_SMTP_URL in $ENV_FILE" >&2
  echo "  or populate $MAIL_WIRE (ORGOS_SMTP_*)" >&2
  exit 1
fi

if [[ -z "$TO" ]]; then
  TO="${ORGOS_MAIL_FROM:-${ORGOS_SMTP_USER:-}}"
  if [[ -z "$TO" ]] && [[ -f "$MAIL_WIRE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$MAIL_WIRE"
    set +a
    TO="${ORGOS_SMTP_USER:-}"
  fi
fi
if [[ -z "$TO" ]]; then
  echo "Usage: $0 <recipient-email>" >&2
  exit 1
fi

export ORGOS_MAIL_FROM="${ORGOS_MAIL_FROM:-${ORGOS_SMTP_USER:-}}"

cd "$ROOT"
echo "Mail drill → ${TO}"
npm run orgos -- ledger product mail-drill --to "$TO"
npm run orgos -- ledger product readiness --commercial | grep -E "Commercial readiness|mail-smtp"
