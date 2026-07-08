#!/usr/bin/env bash
# Local production-style Operator Console stack (witness hubs + console).
# Usage: bash scripts/deploy-operator-console-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ORGOS_ENV=production
export STEWARD_CHAT_AUTH=1
export ORGOS_CSRF=0
export ORGOS_RATE_LIMIT=0
export ORGOS_LLM_MOCK=1
export WIRE_CONSOLE_DEV_PASSKEY=orgos-dev
export ORGOS_TENANT="${ORGOS_TENANT:-demo}"

echo "Building operator console…"
npm run operator-console:build

echo "Starting witness hubs…"
docker compose -f deploy/witness-hub/docker-compose.yaml up -d hub-a hub-b
docker compose -f deploy/witness-hub/docker-compose.yaml run --rm hub-init || true

echo "Starting operator console on :9470 (dev passkey for local prod smoke)…"
export OPERATOR_CONSOLE_PORT=9470
export OPERATOR_CONSOLE_HOST=127.0.0.1

node --import tsx src/cli.ts operator console start --host 127.0.0.1 --port 9470 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

sleep 3
npm run prod:verify -- --url "http://127.0.0.1:9470" --tenant demo --skip-doctor \
  --hub-url "http://127.0.0.1:9474" --hub-url "http://127.0.0.1:9475"

echo "✓ local prod stack verified"
