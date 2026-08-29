#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TENANT_ID="${1:-}"
ARCHIVE="${2:-}"
FORCE="${FORCE:-0}"
if [[ -z "$TENANT_ID" || -z "$ARCHIVE" ]]; then
  echo "Usage: $0 <tenant-id> <archive.tar.gz> [FORCE=1]" >&2
  exit 1
fi
ARGS=(ledger product restore --tenant-id "$TENANT_ID" --archive "$ARCHIVE")
if [[ "$FORCE" == "1" ]]; then
  ARGS+=(--force)
fi
npm run orgos -- "${ARGS[@]}"
