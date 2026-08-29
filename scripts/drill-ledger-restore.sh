#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TENANT_ID="${1:-}"
ARCHIVE="${2:-}"
if [[ -z "$TENANT_ID" || -z "$ARCHIVE" ]]; then
  echo "Usage: $0 <tenant-id> <archive.tar.gz>" >&2
  exit 1
fi
npm run orgos -- ledger product restore-drill --tenant-id "$TENANT_ID" --archive "$ARCHIVE"
