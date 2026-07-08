#!/usr/bin/env bash
set -euo pipefail
cd /app

if [[ ! -x node_modules/.bin/vitest ]]; then
  echo "[docker-test] npm ci …"
  npm ci
fi

if [[ "${ORGOS_DOCKER_INSTALL_PLAYWRIGHT:-}" == "1" ]] && [[ ! -d node_modules/.cache/ms-playwright ]]; then
  echo "[docker-test] playwright install chromium …"
  npx playwright install --with-deps chromium
fi

exec "$@"
