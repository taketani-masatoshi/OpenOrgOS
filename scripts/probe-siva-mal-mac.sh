#!/usr/bin/env bash
# Probe SiVa for MAL Mac BP2 — no secrets, no card.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${ORGOS_SIVA_BASE_URL:-http://127.0.0.1:8080}"
BASE="${BASE%/}"

echo "=== probe SiVa at $BASE ==="

# SiVa validate typically wants JSON with document base64; empty body may 4xx — port must answer.
code="$(curl -s -o /tmp/siva-probe-body.txt -w '%{http_code}' \
  -X POST "$BASE/validate" \
  -H 'content-type: application/json' \
  -d '{"filename":"probe.asice","document":""}' || true)"

echo "POST /validate → HTTP $code"
head -c 400 /tmp/siva-probe-body.txt 2>/dev/null || true
echo

if [[ "$code" == "000" || -z "$code" ]]; then
  echo "FAIL: SiVa unreachable — run: bash scripts/setup-siva-mal-mac.sh start"
  exit 1
fi

# 4xx/5xx with a body still means the process is up (good for BP2 host check)
echo "SiVa process is responding (BP2 host check PASS)"
echo
echo "=== orgos esign ready ==="
export ORGOS_SIVA_MODE="${ORGOS_SIVA_MODE:-live}"
export ORGOS_SIVA_BASE_URL="$BASE"
export ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK="${ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK:-1}"

READY="$(node --import tsx src/cli.ts --tenant mal operations esign ready --json)"
echo "$READY" | node -e '
const j = JSON.parse(require("fs").readFileSync(0,"utf8"));
if (j.siva_mode !== "live") { console.error("FAIL: siva_mode", j.siva_mode); process.exit(1); }
if (!j.siva_configured) { console.error("FAIL: siva_configured false"); process.exit(1); }
if (JSON.stringify(j).match(/Bearer\s+\S+/i)) { console.error("FAIL: token leaked"); process.exit(1); }
console.log("ready PASS · siva_base_url=", j.siva_base_url, "loopback=", j.allow_http_loopback);
'
echo "PROBE PASS"
