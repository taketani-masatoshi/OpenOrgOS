#!/usr/bin/env bash
# Deploy city-named Witness Hub pool (Docker) · k=3 · n=4 core
# Cities: Tokyo · Dubai · Tallinn · Dublin (witness-hub-governance.md §7.B)
#
# Usage:
#   ./scripts/deploy-city-hubs.sh           # core n=4
#   ./scripts/deploy-city-hubs.sh --global # n=8 global profile
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="deploy/witness-hub/docker-compose.cities.yaml"
GLOBAL="${1:-}"

echo "=== City Witness Hub deploy (k=3 · n=4+) ==="

if [[ "$GLOBAL" == "--global" ]]; then
  echo "Starting core + global hubs (n=8)…"
  docker compose -f "$COMPOSE" run --rm hub-deps
  docker compose -f "$COMPOSE" --profile global up -d
  HUB_POOL=global HUB_DOCKER_NETWORK=1 \
    docker compose -f "$COMPOSE" run --rm --no-deps hub-init
else
  echo "Starting core hubs: Tokyo · Dubai · Tallinn · Dublin…"
  docker compose -f "$COMPOSE" run --rm hub-deps
  docker compose -f "$COMPOSE" up -d --remove-orphans hub-tokyo hub-dubai hub-tallinn hub-dublin
  HUB_POOL=core HUB_DOCKER_NETWORK=1 \
    docker compose -f "$COMPOSE" run --rm --no-deps hub-init
fi

echo ""
echo "=== Hub health (host) ==="
for port in 9474 9475 9476 9477; do
  curl -sf "http://127.0.0.1:${port}/hub/v1/health" | head -c 120
  echo " · :${port}"
done

echo ""
npm run orgos -- --tenant mal protocol witness pool status

echo ""
echo "✓ City Hub deploy complete"
echo "  Pool config: tenants/mal/data/protocol/witness-pool.yaml"
echo "  Registry snippet: deploy/witness-hub/data/trusted-hubs-docker.generated.yaml"
echo "  Stop: docker compose -f $COMPOSE down"
