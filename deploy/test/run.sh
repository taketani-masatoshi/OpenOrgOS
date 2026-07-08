#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if (($#)); then
  echo "[docker-test] npm test -- $*"
else
  echo "[docker-test] npm test (full suite — ~2 min)"
fi
docker compose -f deploy/test/docker-compose.yaml run --rm --build test npm test -- "$@"
