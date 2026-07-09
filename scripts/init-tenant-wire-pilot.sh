#!/usr/bin/env bash
# Bootstrap Wire + Gov + Witness pilot config for a tenant.
# Usage: ./scripts/init-tenant-wire-pilot.sh [tenant]
set -euo pipefail
TENANT="${1:-mal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PROTO_DIR="$ROOT/tenants/$TENANT/data/protocol"
SEED="$ROOT/steward/platform/protocol/seed"

mkdir -p "$PROTO_DIR"

echo "=== Wire pilot init ($TENANT) ==="

if [[ ! -f "$PROTO_DIR/wire-gateway.yaml" ]]; then
  npm run orgos -- --tenant "$TENANT" wire-gateway init
else
  echo "· wire-gateway.yaml exists (skip init)"
fi

if [[ ! -f "$PROTO_DIR/gov-gateway.yaml" ]]; then
  cp "$SEED/gov-gateway-live-pilot.yaml.example" "$PROTO_DIR/gov-gateway.yaml"
  echo "✓ copied gov-gateway.yaml from seed"
else
  echo "· gov-gateway.yaml exists (skip)"
fi

if [[ ! -f "$PROTO_DIR/wire-export-policy.yaml" ]]; then
  cp "$SEED/wire-export-policy.yaml.example" "$PROTO_DIR/wire-export-policy.yaml"
  echo "✓ copied wire-export-policy.yaml from seed"
else
  echo "· wire-export-policy.yaml exists (skip)"
fi

if [[ ! -f "$PROTO_DIR/peers.yaml" ]]; then
  if [[ -f "$SEED/mal-peers-pilot.yaml.example" ]] && [[ "$TENANT" == "mal" ]]; then
    cp "$SEED/mal-peers-pilot.yaml.example" "$PROTO_DIR/peers.yaml"
    echo "✓ copied peers.yaml from mal pilot seed"
  else
    echo 'as_of: "2026-07-10"' > "$PROTO_DIR/peers.yaml"
    echo "peers: []" >> "$PROTO_DIR/peers.yaml"
    echo "✓ created peers.yaml (empty registry)"
  fi
else
  echo "· peers.yaml exists (skip)"
fi

if [[ ! -f "$PROTO_DIR/wire-internal.token.example" ]]; then
  cat > "$PROTO_DIR/wire-internal.token.example" <<'EOF'
# Copy to wire-internal.token — do not commit the real token file.
mal-wire-internal-reference-token-do-not-use-in-production
EOF
  echo "✓ created wire-internal.token.example"
else
  echo "· wire-internal.token.example exists (skip)"
fi

JURISDICTION="${ORGOS_JURISDICTION:-JP}"
npm run orgos -- --tenant "$TENANT" protocol witness pool init-trusted --jurisdiction "$JURISDICTION"

if [[ -f "$PROTO_DIR/wire-gateway.yaml" ]] && ! grep -q '^did:' "$PROTO_DIR/wire-gateway.yaml" 2>/dev/null; then
  npm run orgos -- --tenant "$TENANT" wire-gateway did init || true
fi

echo ""
echo "=== Production gates ==="
WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.${TENANT}.example}" \
  ./scripts/prod-validate-wire.sh "$TENANT"

echo ""
echo "✓ Wire pilot init complete for $TENANT"
echo "  Hub stack: docker compose -f deploy/witness-hub/docker-compose.yaml up -d hub-a hub-b"
echo "  Relay:     npm run orgos -- --tenant $TENANT protocol relay run"
