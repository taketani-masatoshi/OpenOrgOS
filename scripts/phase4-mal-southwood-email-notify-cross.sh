#!/usr/bin/env bash
# mal → southwood email_notify cross-org live (keeps local Gateway up for the run)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
RUNTIME="$ROOT/scratch/mal-wire-live"
mkdir -p "$RUNTIME"
INTERNAL_BEARER="${INTERNAL_BEARER:-mal-pilot-internal-dev}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://wire.oorgos.org}"

load_env() {
  local f
  for f in \
    "$ROOT/tenants/mal/records/executive/smtp.env" \
    "$ROOT/deploy/mal-pilot/env/.env.mail-wire"; do
    if [[ -f "$f" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
    fi
  done
}

stop_pid() {
  local name="$1"
  local pidfile="$RUNTIME/${name}.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    rm -f "$pidfile"
  fi
}

start_stack() {
  stop_pid internal-api
  stop_pid wire-gateway

  ORGOS_TENANT=mal WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
    npm run orgos -- wire-gateway internal-api serve \
      --tenant mal --host 127.0.0.1 --port 8080 --bearer-token "$INTERNAL_BEARER" \
      >"$RUNTIME/internal-api.log" 2>&1 &
  echo $! >"$RUNTIME/internal-api.pid"

  for _ in $(seq 1 30); do
    if curl -sf -H "Authorization: Bearer $INTERNAL_BEARER" \
      "http://127.0.0.1:8080/internal/v1/wire/node" >/dev/null; then
      break
    fi
    sleep 1
  done

  ORGOS_TENANT=mal WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
    npm run orgos -- wire-gateway serve \
      --tenant mal --host 0.0.0.0 --port 8443 --public-base-url "$PUBLIC_BASE_URL" \
      >"$RUNTIME/wire-gateway.log" 2>&1 &
  echo $! >"$RUNTIME/wire-gateway.pid"

  for _ in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:8443/wire/v1/health" >/dev/null; then
      break
    fi
    sleep 1
  done
  curl -sf "http://127.0.0.1:8443/wire/v1/health" >/dev/null \
    || { echo "✗ local Gateway failed"; tail -20 "$RUNTIME/wire-gateway.log"; exit 1; }
  echo "✓ local Gateway http://127.0.0.1:8443"

  if [[ -f "$ROOT/deploy/mal-pilot/env/.env.cloudflared" ]]; then
    docker compose --env-file "$ROOT/deploy/mal-pilot/env/.env.cloudflared" \
      -f "$ROOT/deploy/mal-pilot/docker-compose.cloudflared.yaml" up -d --force-recreate >/dev/null
    sleep 6
  fi
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_BASE_URL/wire/v1/health" || true)"
  echo "✓ public health $PUBLIC_BASE_URL → HTTP $code"
}

cleanup() {
  stop_pid wire-gateway
  stop_pid internal-api
}
trap cleanup EXIT

load_env
# Mail env may set PUBLIC_BASE_URL for other pilots — force Wire Gateway public URL for notify Pull.
export PUBLIC_BASE_URL="${PHASE4_CROSS_PUBLIC_BASE_URL:-https://wire.oorgos.org}"
start_stack
export ORGOS_TENANT=mal
node --import tsx "$ROOT/scripts/phase4-mal-southwood-email-notify-cross.ts"
