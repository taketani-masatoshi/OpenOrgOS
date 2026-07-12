#!/usr/bin/env bash
# Stage only Phase 4a / washout paths (F7 isolation helper).
# Does NOT commit. Review `git status` / `git diff --cached` before commit.
# Usage: ./scripts/phase4a-stage.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/scripts/phase4a-paths.manifest"
cd "$ROOT"

if [[ ! -f "$MANIFEST" ]]; then
  echo "✗ missing $MANIFEST" >&2
  exit 1
fi

MISSING=0
STAGED=0
while IFS= read -r p || [[ -n "$p" ]]; do
  [[ -z "$p" || "$p" =~ ^[[:space:]]*# ]] && continue
  if [[ ! -e "$p" ]]; then
    echo "⚠ missing (skip): $p"
    MISSING=$((MISSING + 1))
    continue
  fi
  git add -- "$p"
  echo "✓ staged $p"
  STAGED=$((STAGED + 1))
done < "$MANIFEST"

echo ""
echo "Staged $STAGED Phase 4a paths. Missing skipped: $MISSING"
echo "Next: git status && git diff --cached --stat"
echo "Do NOT add tenants/*/records/** or .env* (L2)."
