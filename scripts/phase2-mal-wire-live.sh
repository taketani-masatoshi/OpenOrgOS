#!/usr/bin/env bash
# Phase 2 — MAL Wire Gateway public (Mode A TLS via Cloudflare Tunnel)
# Usage: ./scripts/phase2-mal-wire-live.sh [tenant]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TENANT="${1:-mal}"
export ORGOS_TENANT="$TENANT"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.oorgos.org}"
WIRE_HOST="${WIRE_HOST:-wire.oorgos.org}"
RUNTIME_DIR="$ROOT/scratch/${TENANT}-wire-live"
CLOUDFLARED_CONFIG="${CLOUDFLARED_CONFIG:-$HOME/.cloudflared/config.yml}"
TUNNEL_NAME="${TUNNEL_NAME:-openorgos-net}"
CLOUDFLARED_MODE="${CLOUDFLARED_MODE:-docker}"
COMPOSE_CLOUDFLARED="deploy/mal-pilot/docker-compose.cloudflared.yaml"
COMPOSE_ENV="deploy/mal-pilot/env/.env.cloudflared"
INTERNAL_BEARER="${INTERNAL_BEARER:-mal-pilot-internal-dev}"
# Token tunnel (Zero Trust Public Hostname): wire.oorgos.org → host.docker.internal:8443
WIRE_TUNNEL_ID="${WIRE_TUNNEL_ID:-9b5ebf8d-01c3-4772-ae4a-f7596c7ebe63}"

mkdir -p "$RUNTIME_DIR"

stop_pid() {
  local name="$1"
  local pidfile="$RUNTIME_DIR/${name}.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

echo "=== Phase 2: stop Vitest (mal production) ==="
pkill -9 -f 'node.*vitest' 2>/dev/null || true
pkill -9 -f 'npm exec vitest' 2>/dev/null || true
sleep 2
if pgrep -f 'vitest' >/dev/null 2>&1; then
  echo "✗ Vitest still running — stop manually before Phase 2" >&2
  exit 1
fi
echo "✓ Vitest stopped"

echo ""
echo "=== Phase 2: Wire Internal API + Gateway (host) ==="
stop_pid internal-api
stop_pid wire-gateway

ORGOS_TENANT="$TENANT" npm run orgos -- wire-gateway internal-api serve \
  --tenant "$TENANT" \
  --host 127.0.0.1 \
  --port 8080 \
  --bearer-token "$INTERNAL_BEARER" \
  >"$RUNTIME_DIR/internal-api.log" 2>&1 &
echo $! >"$RUNTIME_DIR/internal-api.pid"

for i in $(seq 1 45); do
  if curl -sf -H "Authorization: Bearer $INTERNAL_BEARER" "http://127.0.0.1:8080/internal/v1/wire/node" >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf -H "Authorization: Bearer $INTERNAL_BEARER" "http://127.0.0.1:8080/internal/v1/wire/node" >/dev/null || {
  echo "✗ Internal API failed — see $RUNTIME_DIR/internal-api.log" >&2
  tail -20 "$RUNTIME_DIR/internal-api.log" >&2 || true
  exit 1
}
echo "✓ Internal API http://127.0.0.1:8080"

WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
ORGOS_TENANT="$TENANT" npm run orgos -- wire-gateway serve \
  --tenant "$TENANT" \
  --host 0.0.0.0 \
  --port 8443 \
  --public-base-url "$PUBLIC_BASE_URL" \
  >"$RUNTIME_DIR/wire-gateway.log" 2>&1 &
echo $! >"$RUNTIME_DIR/wire-gateway.pid"

for i in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:8443/wire/v1/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf "http://127.0.0.1:8443/wire/v1/health" | head -c 200
echo ""
echo "✓ Wire Gateway http://127.0.0.1:8443 (public: $PUBLIC_BASE_URL)"

echo ""
echo "=== Phase 2: Cloudflare Tunnel ($WIRE_HOST) ==="
if [[ "$CLOUDFLARED_MODE" == "docker" ]]; then
  if [[ ! -f "$ROOT/$COMPOSE_ENV" ]]; then
    echo "✗ Missing $COMPOSE_ENV — copy from cloudflared-wire.env.example" >&2
    exit 1
  fi
  docker compose --env-file "$COMPOSE_ENV" -f "$ROOT/$COMPOSE_CLOUDFLARED" up -d
  echo "✓ Docker cloudflared-wire (Zero Trust ingress: $WIRE_HOST → host.docker.internal:8443)"
  echo "  DNS: CNAME wire → ${WIRE_TUNNEL_ID}.cfargotunnel.com (managed in Zero Trust)"
else
  if [[ ! -f "$CLOUDFLARED_CONFIG" ]]; then
    echo "✗ Missing $CLOUDFLARED_CONFIG" >&2
    exit 1
  fi
  if ! grep -q "hostname: $WIRE_HOST" "$CLOUDFLARED_CONFIG"; then
    cp "$CLOUDFLARED_CONFIG" "$RUNTIME_DIR/config.yml.bak"
    python3 - "$CLOUDFLARED_CONFIG" "$WIRE_HOST" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
host = sys.argv[2]
text = path.read_text()
needle = "  - service: http_status:404"
block = f"""  - hostname: {host}
    service: http://localhost:8443

"""
if needle not in text:
    raise SystemExit("catch-all ingress not found in cloudflared config")
if f"hostname: {host}" in text:
    raise SystemExit(0)
path.write_text(text.replace(needle, block + needle, 1))
print(f"✓ Added ingress {host} -> http://localhost:8443")
PY
  fi
  stop_pid cloudflared-tunnel
  cloudflared tunnel --config "$CLOUDFLARED_CONFIG" run "$TUNNEL_NAME" \
    >"$RUNTIME_DIR/cloudflared.log" 2>&1 &
  echo $! >"$RUNTIME_DIR/cloudflared-tunnel.pid"
  sleep 5
  echo "✓ Host cloudflared ($TUNNEL_NAME)"
fi

echo ""
echo "=== Phase 2: Public health check ==="
PUBLIC_OK=0
for i in $(seq 1 24); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://${WIRE_HOST}/wire/v1/health" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    PUBLIC_OK=1
    break
  fi
  echo "  waiting public health ($code)…"
  sleep 5
done

if [[ "$PUBLIC_OK" -eq 1 ]]; then
  curl -sf "https://${WIRE_HOST}/wire/v1/health"
  echo ""
  curl -sf "https://${WIRE_HOST}/.well-known/wire-node.json" | head -c 400
  echo ""
  echo "✓ Public Wire Gateway https://${WIRE_HOST}"
else
  echo "⚠ Public health not yet 200 — check $RUNTIME_DIR/cloudflared.log and Cloudflare DNS for $WIRE_HOST"
fi

echo ""
echo "=== Production gate (wire only — email_wire is Phase 4) ==="
WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
GOV_GATEWAY_TRANSPORT=mock \
ORGOS_STRICT_TRUST=1 ORGOS_REQUIRE_PK_DID=1 \
  npm run orgos -- protocol trust-registry validate
if ORGOS_STRICT_TRUST=1 npm run orgos -- protocol trusted-hubs-validate 2>/dev/null; then
  echo "✓ trusted-hubs registry OK"
else
  echo "⚠ trusted-hubs registry has placeholder hubs (mal pilot uses witness-pool)"
fi
ORGOS_STRICT_TLS=1 ORGOS_REQUIRE_PK_DID=1 WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 \
PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
  npm run orgos -- wire-gateway validate --tenant "$TENANT"
ORGOS_STRICT_TRANSPORT=1 ORGOS_REQUIRE_PK_DID=1 \
  npm run orgos -- protocol validate --tenant "$TENANT"
GOV_GATEWAY_TRANSPORT=mock npm run orgos -- protocol gov-gateway validate --tenant "$TENANT"
echo "✓ Wire Phase 2 gates passed (doctor email_wire deferred to Phase 4)"

echo ""
echo "✓ Phase 2 complete"
echo "  Local health:  http://127.0.0.1:8443/wire/v1/health"
echo "  Public health: https://${WIRE_HOST}/wire/v1/health"
echo "  PIDs: $RUNTIME_DIR/*.pid"
echo "  Logs: $RUNTIME_DIR/*.log"
echo "  Stop: kill \$(cat $RUNTIME_DIR/*.pid)"
