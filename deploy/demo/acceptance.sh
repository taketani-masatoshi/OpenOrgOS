#!/usr/bin/env bash
# Demo Docker acceptance — A1–A4 (design: docs/org-os/demo-docker.md)
set -euo pipefail

BASE="${ORGOS_DEMO_URL:-http://127.0.0.1:9470}"
TIMEOUT="${ORGOS_DEMO_WAIT_SEC:-120}"

echo "Waiting for ${BASE}/health (timeout ${TIMEOUT}s)…"
deadline=$((SECONDS + TIMEOUT))
until curl -sf "${BASE}/health" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "FAIL: health not ready within ${TIMEOUT}s" >&2
    exit 1
  fi
  sleep 2
done
echo "✓ A1 health"

health_body="$(curl -sf "${BASE}/health")"
if ! grep -q '"auth":false' <<<"${health_body}" && ! grep -q '"auth": false' <<<"${health_body}"; then
  echo "FAIL: expected demo health auth:false — got: ${health_body}" >&2
  exit 1
fi
echo "✓ A1b health reports auth disabled (demo)"

code_chat="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/")"
code_wire="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/wire/")"
[[ "${code_chat}" == "200" ]] || { echo "FAIL: Chat UI HTTP ${code_chat}" >&2; exit 1; }
[[ "${code_wire}" == "200" ]] || { echo "FAIL: Wire UI HTTP ${code_wire}" >&2; exit 1; }
echo "✓ A2 Chat UI"
echo "✓ A3 Wire UI"

code_today="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/chat/v1/today")"
[[ "${code_today}" == "200" ]] || { echo "FAIL: Chat API /today HTTP ${code_today}" >&2; exit 1; }
echo "✓ A4 Chat API /today (unauthenticated demo)"

code_wire_me="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/console/v1/auth/me")"
[[ "${code_wire_me}" == "401" ]] || { echo "FAIL: Wire /auth/me should be 401 without session — got ${code_wire_me}" >&2; exit 1; }
echo "✓ A4b Wire API requires session"

echo "OK — demo acceptance passed"
