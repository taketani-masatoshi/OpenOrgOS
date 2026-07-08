#!/usr/bin/env bash
# Cron-friendly health check — exit 0 when OK, 1 when unhealthy.
set -euo pipefail

URL="${OPERATOR_CONSOLE_URL:-http://127.0.0.1:9470}"
HEALTH="${URL%/}/health"

if ! curl -sf "${HEALTH}" | grep -q '"ok":true'; then
  echo "FAIL: ${HEALTH}"
  exit 1
fi

echo "OK: ${HEALTH}"
