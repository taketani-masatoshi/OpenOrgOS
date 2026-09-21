#!/usr/bin/env bash
# Fail if known real-world PII appears outside tenants/ (product tip gate).
# tests/fixtures/org-charts/ mirrors tip tenants until the mal transfer PR;
# those copies are excluded here so restore-protocol can keep mal tests green.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Keep the forbidden literals only in this one allowlisted file.
PATTERN='段燕燕|宮城万貴子|松尾剛行|桃尾・松尾・難波|malkk\.com|4010001189530|千代田区二番町'

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

git ls-files \
  | grep -Ev '^(tenants/|node_modules/|package-lock\.json$|scripts/check-pii\.sh$|tests/fixtures/org-charts/)' \
  | grep -Ev '\.(png|jpg|jpeg|gif|webp|pdf|woff2?)$' \
  | while IFS= read -r f; do
      [[ -f "$f" ]] || continue
      if rg -q -- "$PATTERN" "$f" 2>/dev/null; then
        printf '%s\n' "$f" >>"$TMP"
      fi
    done

if [[ -s "$TMP" ]]; then
  echo "check-pii: forbidden real-world PII found outside tenants/:" >&2
  sort -u "$TMP" | sed 's/^/  /' >&2
  echo "Replace with synthetic fixture values (see docs/org-os/tenant-github-tip-policy.md)." >&2
  exit 1
fi

echo "check-pii: ok (no forbidden PII outside tenants/)"
