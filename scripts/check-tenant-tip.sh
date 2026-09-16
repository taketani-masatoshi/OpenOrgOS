#!/usr/bin/env bash
# Fail if the tip tracks tenant material that policy keeps local.
# Policy: docs/org-os/tenant-github-tip-policy.md (no history rewrite; tip only).
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

# quotepath=false keeps non-ASCII tenant paths readable and greppable.
ls_files() {
  git -c core.quotepath=false ls-files "$@"
}

# Template and fixture tenants are the documented exception.
drop_allowed() {
  grep -v \
    -e '^tenants/_template/' \
    -e '^tenants/_fixture-books/' \
    -e '\.example' \
    -e '00-README' \
    -e '00-このフォルダについて' \
    || true
}

errors=0

report() {
  local label="$1" hits="$2" hint="$3"
  if [[ -n "$hits" ]]; then
    echo "✗ $label" >&2
    echo "$hits" | sed 's/^/    /' >&2
    [[ -n "$hint" ]] && echo "  → $hint" >&2
    errors=1
  fi
}

# 1. Anything gitignored must not also be tracked — that is how payroll and
#    runtime files leaked back onto the tip before.
report "gitignored paths are still tracked" \
  "$(ls_files -c -i --exclude-standard | drop_allowed)" \
  "git rm --cached <path>"

# 2. Private key material must never be tracked.
report "key material is tracked on the tip" \
  "$(ls_files '*.pem' '*.key' 'tenants/*/data/org-signing/*' 2>/dev/null \
     | grep -v -e 'signing-key-meta' | drop_allowed)" \
  "keep keys in the local workspace only"

# 3. Operational tenant runtime that belongs to the local workspace only.
report "tenant chat/records runtime is tracked on the tip" \
  "$(ls_files \
       'tenants/*/data/chat/threads/*' \
       'tenants/*/data/chat/command-plans/*' \
       'tenants/*/data/chat/tower-plans/*' \
       'tenants/*/records/executive/*' 2>/dev/null | drop_allowed)" \
  "runtime is regenerated locally; do not commit it"

# 4. Sensitive finance ledgers outside template / fixture tenants.
report "tenant finance ledgers are tracked outside _template / _fixture-books" \
  "$(ls_files \
       'tenants/*/data/finance/payroll.yaml' \
       'tenants/*/data/finance/bank-accounts.yaml' \
       'tenants/*/data/finance/bank-statements.yaml' 2>/dev/null | drop_allowed)" \
  "git rm --cached <path> and keep the ledger local"

if [[ "$errors" -ne 0 ]]; then
  echo "See docs/org-os/tenant-github-tip-policy.md" >&2
  exit 1
fi

echo "✓ tenant tip clean (no gitignored-but-tracked, key, runtime, or finance leaks)"
