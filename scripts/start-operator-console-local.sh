#!/bin/zsh
# FALLBACK ONLY — prefer OS_Community/scripts/start-local-stack.sh (Docker baked image).
# Use this when Docker is unavailable. Does NOT pick alternate ports (avoids dual consoles).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
cd /Users/kk/OS_Steward

ENV_FILE="${COMMUNITY_ENV_FILE:-/Users/kk/OS_Community/.env}"
HOST="${OPERATOR_CONSOLE_HOST:-127.0.0.1}"
PORT="${OPERATOR_CONSOLE_PORT:-9470}"
PID_FILE="${OPERATOR_CONSOLE_PID_FILE:-/tmp/orgos-operator-console.pid}"
LOG_FILE="${OPERATOR_CONSOLE_LOG_FILE:-/tmp/operator-console-start.log}"

echo "NOTE: Host Operator Console is a fallback." | tee "$LOG_FILE"
echo "      Prefer: /Users/kk/OS_Community/scripts/start-local-stack.sh" | tee -a "$LOG_FILE"

env_get() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' || true
}

port_health() {
  curl -s -m 1 --noproxy '*' "http://${HOST}:${PORT}/health" 2>/dev/null || true
}

free_port() {
  local pids
  pids="$(lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Freeing :$PORT (PIDs: $pids)" | tee -a "$LOG_FILE"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 1
    fi
  fi
  pkill -f "src/cli.ts operator console start --host ${HOST} --port ${PORT}" 2>/dev/null || true
  rm -f "$PID_FILE"
  sleep 0.5
  # Docker ghost bind — do NOT migrate to another port (causes dual-console confusion)
  if [[ -n "$(port_health)" ]]; then
    echo "ERROR: :${PORT} still answers after free_port (likely Docker orgos-demo)." | tee -a "$LOG_FILE"
    echo "      health=$(port_health)" | tee -a "$LOG_FILE"
    echo "Stop it, then re-run:" >&2
    echo "  docker ps --filter publish=${PORT} && docker stop <id>" >&2
    echo "  /Users/kk/OS_Community/scripts/start-local-stack.sh" >&2
    exit 1
  fi
}

export ORGOS_ENV="${ORGOS_ENV:-development}"
export ORGOS_TENANT="${ORGOS_TENANT:-mal}"
export ORGOS_WORKSPACE="${ORGOS_WORKSPACE:-/Users/kk/OS_Steward}"
export STEWARD_CHAT_AUTH="${STEWARD_CHAT_AUTH:-1}"
export WIRE_CONSOLE_AUTH="${WIRE_CONSOLE_AUTH:-prod}"
export WIRE_CONSOLE_PROD_ADAPTER="${WIRE_CONSOLE_PROD_ADAPTER:-webauthn}"
export WIRE_CONSOLE_WEBAUTHN_RP_ID="${WIRE_CONSOLE_WEBAUTHN_RP_ID:-localhost}"
export WIRE_CONSOLE_WEBAUTHN_ORIGIN="${WIRE_CONSOLE_WEBAUTHN_ORIGIN:-http://localhost:${PORT}}"
export WIRE_CONSOLE_WEBAUTHN_ALLOW_REGISTER="${WIRE_CONSOLE_WEBAUTHN_ALLOW_REGISTER:-0}"
export ORGOS_SETTLEMENT_STEPUP="${ORGOS_SETTLEMENT_STEPUP:-1}"
export ORGOS_SETTLEMENT_APPROVE_ORIGIN="${ORGOS_SETTLEMENT_APPROVE_ORIGIN:-http://localhost:4178}"

export ORGOS_USE_OLLAMA="${ORGOS_USE_OLLAMA:-1}"
if [[ "${ORGOS_USE_OLLAMA}" == "1" ]]; then
  export ORGOS_LLM_MOCK=0
  export ORGOS_LLM_PROVIDER="${ORGOS_LLM_PROVIDER:-openai-compatible}"
  export ORGOS_LLM_API_URL="${ORGOS_LLM_API_URL:-http://127.0.0.1:11434/v1}"
  export ORGOS_LLM_API_KEY="${ORGOS_LLM_API_KEY:-ollama}"
  export ORGOS_LLM_MODEL="${ORGOS_LLM_MODEL:-gemma4:latest}"
  export ORGOS_LLM_STRUCTURED="${ORGOS_LLM_STRUCTURED:-0}"
else
  export ORGOS_LLM_MOCK="${ORGOS_LLM_MOCK:-1}"
fi

ISSUER="$(env_get COMMUNITY_CONSOLE_OIDC_ISSUER)"
AUDIENCE="$(env_get COMMUNITY_CONSOLE_OIDC_AUDIENCE)"
SECRET="$(env_get WIRE_CONSOLE_OIDC_HS256_SECRET)"
if [[ -z "$SECRET" ]]; then
  SECRET="$(env_get COMMUNITY_CONSOLE_OIDC_HS256_SECRET)"
fi

export WIRE_CONSOLE_OIDC_ISSUER="${WIRE_CONSOLE_OIDC_ISSUER:-${ISSUER:-https://community.oorgos.org}}"
export WIRE_CONSOLE_OIDC_AUDIENCE="${WIRE_CONSOLE_OIDC_AUDIENCE:-${AUDIENCE:-orgos-operator-console}}"
export WIRE_CONSOLE_OIDC_HS256_SECRET="${WIRE_CONSOLE_OIDC_HS256_SECRET:-$SECRET}"
export WIRE_CONSOLE_OIDC_ALLOW_HS256="${WIRE_CONSOLE_OIDC_ALLOW_HS256:-1}"

if [[ -z "${WIRE_CONSOLE_OIDC_HS256_SECRET:-}" ]]; then
  echo "ERROR: WIRE_CONSOLE_OIDC_HS256_SECRET is empty." >&2
  echo "Set COMMUNITY_CONSOLE_OIDC_HS256_SECRET in $ENV_FILE" >&2
  exit 1
fi

# If Docker operator is already the integrated path, refuse host start
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker compose -f /Users/kk/OS_Community/docker-compose.yml \
      -f /Users/kk/OS_Community/docker-compose.operator.yml \
      --profile operator ps --status running 2>/dev/null | grep -q operator-console; then
    echo "ERROR: Docker operator-console is already running." >&2
    echo "Use: /Users/kk/OS_Community/scripts/start-local-stack.sh" >&2
    exit 1
  fi
fi

free_port

{
  echo "Operator Console SSO: issuer=$WIRE_CONSOLE_OIDC_ISSUER audience=$WIRE_CONSOLE_OIDC_AUDIENCE secret=set"
  if [[ "${ORGOS_USE_OLLAMA}" == "1" ]]; then
    echo "Operator Console LLM: Ollama ${ORGOS_LLM_API_URL} model=${ORGOS_LLM_MODEL} mock=0 structured=${ORGOS_LLM_STRUCTURED}"
  else
    echo "Operator Console LLM: mock=${ORGOS_LLM_MOCK:-1}"
  fi
  echo "Binding ${HOST}:${PORT} (auth=${WIRE_CONSOLE_AUTH:-} adapter=${WIRE_CONSOLE_PROD_ADAPTER:-} pid file $PID_FILE)"
} | tee -a "$LOG_FILE"

python3 - "$HOST" "$PORT" "$PID_FILE" "$LOG_FILE.runtime" <<'PY'
import os, sys, subprocess, time, urllib.request
host, port, pid_file, runtime_log = sys.argv[1:5]
log = open(runtime_log, "ab", buffering=0)
proc = subprocess.Popen(
    ["npm", "run", "orgos", "--", "operator", "console", "start", "--host", host, "--port", port],
    cwd="/Users/kk/OS_Steward",
    env=os.environ.copy(),
    stdout=log,
    stderr=log,
    start_new_session=True,
)
open(pid_file, "w", encoding="utf-8").write(str(proc.pid))
url = f"http://{host}:{port}/health"
for _ in range(30):
    time.sleep(1)
    if proc.poll() is not None:
        sys.exit(f"process exited early code={proc.returncode}")
    try:
        with urllib.request.urlopen(url, timeout=1) as r:
            body = r.read().decode()
            if '"ok":true' in body:
                print(f"Healthy: {body}")
                print(f"PID {proc.pid} — log {runtime_log}")
                sys.exit(0)
    except Exception:
        pass
sys.exit(f":{port} did not become healthy within 30s")
PY
