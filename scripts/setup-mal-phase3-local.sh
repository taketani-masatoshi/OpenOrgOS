#!/usr/bin/env bash
# Phase 3 — mal テナント L2 ローカルファイル初期化（gitignore · 手動実値入力）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAL="$ROOT/tenants/mal"

copy_if_missing() {
  local example="$1"
  local target="$2"
  if [[ -f "$target" ]]; then
    echo "skip (exists): $target"
  else
    cp "$example" "$target"
    echo "created: $target"
  fi
}

copy_if_missing "$MAL/data/finance/bank-accounts.yaml.example" "$MAL/data/finance/bank-accounts.yaml"
copy_if_missing "$MAL/data/operations/kamezawa-secrets.yaml.example" "$MAL/data/operations/kamezawa-secrets.yaml"

STAMP="$ROOT/scratch/executive-backup-last.txt"
mkdir -p "$(dirname "$STAMP")"
date +%Y-%m-%d > "$STAMP"
echo "wrote: $STAMP"

echo ""
echo "Next: edit REPLACE_ME in bank-accounts.yaml and kamezawa-secrets.yaml (L2 · not committed)"
echo "Then: ORGOS_TENANT=mal npm run orgos -- validate"
