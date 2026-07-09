#!/usr/bin/env bash
# Smoke: Witness Hub stack + mal production gates + relay once.
# Usage: ./scripts/wire-hub-stack-smoke.sh [tenant]
set -euo pipefail
TENANT="${1:-mal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="deploy/witness-hub/docker-compose.yaml"

cleanup() {
  if [[ "${KEEP_STACK:-0}" != "1" ]]; then
    docker compose -f "$COMPOSE" down -v 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== Witness Hub stack up ==="
docker compose -f "$COMPOSE" up -d hub-a hub-b
echo "Waiting for Hub health…"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:9474/hub/v1/health >/dev/null && \
     curl -sf http://127.0.0.1:9475/hub/v1/health >/dev/null; then
    echo "✓ HUB-A + HUB-B healthy"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "✗ Hub health timeout"
    exit 1
  fi
  sleep 2
done

echo ""
echo "=== Witness pool status ($TENANT) ==="
npm run orgos -- --tenant "$TENANT" protocol witness pool status

echo ""
echo "=== Production gates ==="
WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.${TENANT}.example}" \
  ./scripts/prod-validate-wire.sh "$TENANT"

echo ""
echo "=== Relay once ==="
npm run orgos -- --tenant "$TENANT" protocol relay once

echo ""
echo "✓ Wire/Hub stack smoke passed"
