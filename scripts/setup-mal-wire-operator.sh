#!/usr/bin/env bash
# mal Wire 本番パイロット — オペレータセットアップ（TLS · registry · relay 常駐）
# Usage: ./scripts/setup-mal-wire-operator.sh [--install-systemd]
set -euo pipefail
TENANT="${ORGOS_TENANT:-mal}"
INSTALL_SYSTEMD=0
for arg in "$@"; do
  case "$arg" in
    --install-systemd) INSTALL_SYSTEMD=1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 1. Protocol bootstrap ($TENANT) ==="
./scripts/init-tenant-wire-pilot.sh "$TENANT"

echo ""
echo "=== 2. Trust registry publish mirror ==="
./scripts/publish-protocol-registry.sh
echo "  Operator: copy publish/protocol/* → https://oorgos.org/protocol/ (CDN)"

echo ""
echo "=== 3. Wire peer discovery (v2) ==="
npm run orgos -- --tenant "$TENANT" wire-gateway discover --jurisdiction JP
echo "  Register peers:"
npm run orgos -- --tenant "$TENANT" wire-gateway discover --jurisdiction JP --suggest || true

echo ""
echo "=== 4. TLS (Mode A — reverse proxy) ==="
echo "  Set PUBLIC_BASE_URL=https://wire.${TENANT}.example in proxy env"
echo "  Set WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 on Core/Gateway"
echo "  Runbook: docs/org-os/production-tls-runbook.md"
echo "  Dev TLS only: npm run orgos -- --tenant $TENANT wire-gateway tls-init"

echo ""
echo "=== 5. Relay + Gateway 常駐 (systemd) ==="
if [[ "$INSTALL_SYSTEMD" -eq 1 ]]; then
  "$ROOT/scripts/install-mal-wire-systemd.sh" "$TENANT"
else
  echo "  Docker relay:"
  echo "    docker compose -f deploy/witness-hub/docker-compose.yaml \\"
  echo "      -f deploy/mal-pilot/docker-compose.relay.yaml --profile relay up -d"
  echo "  systemd (optional): $0 --install-systemd"
fi

echo ""
echo "=== 6. Production gate ==="
WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.${TENANT}.example}" \
  ./scripts/prod-validate-wire.sh "$TENANT"

echo ""
echo "✓ Operator setup complete for $TENANT"
echo "  Hub smoke: ./scripts/wire-hub-stack-smoke.sh $TENANT"
echo "  Federation: npm run orgos -- wire-gateway federation list"
