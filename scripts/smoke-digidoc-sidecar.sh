#!/usr/bin/env bash
# Optional DigiDoc sidecar smoke (Acceptance §A — Docker).
# Does not start SiVa. Does not require a card.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f services/docker-compose.digidoc.yml)
TOKEN_FILE=services/secrets/digidoc-sidecar.token

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker not installed"
  exit 0
fi

mkdir -p services/secrets
if [[ ! -f "$TOKEN_FILE" ]]; then
  openssl rand -hex 32 >"$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  echo "wrote $TOKEN_FILE"
fi

TOKEN="$(cat "$TOKEN_FILE")"
export ORGOS_DIGIDOC_SIDECAR_URL="${ORGOS_DIGIDOC_SIDECAR_URL:-http://127.0.0.1:9090}"
export ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK=1
export ORGOS_DIGIDOC_SIDECAR_TOKEN="$TOKEN"

echo "=== up digidoc-sidecar ==="
"${COMPOSE[@]}" up --build -d digidoc-sidecar

echo "=== wait /ready ==="
ok=0
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${TOKEN}" \
    "${ORGOS_DIGIDOC_SIDECAR_URL}/ready" || true)"
  if [[ "$code" == "200" ]]; then
    ok=1
    break
  fi
  sleep 2
done
if [[ "$ok" != "1" ]]; then
  echo "FAIL: /ready never returned 200"
  "${COMPOSE[@]}" logs --tail=80 digidoc-sidecar || true
  exit 1
fi
echo "ready=200"

echo "=== reject without Bearer ==="
unauth="$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "${ORGOS_DIGIDOC_SIDECAR_URL}/container/create" \
  -H 'content-type: application/json' \
  -d '{}' || true)"
if [[ "$unauth" != "401" && "$unauth" != "403" ]]; then
  echo "FAIL: expected 401/403 without token, got $unauth"
  exit 1
fi
echo "unauth=$unauth"

echo "=== reject non-PDF body ==="
bad="$(curl -s -o /tmp/sidecar-bad.json -w '%{http_code}' \
  -X POST "${ORGOS_DIGIDOC_SIDECAR_URL}/container/create" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"filename":"x.pdf","document":"bm90LXBkZg=="}' || true)"
if [[ "$bad" == "200" ]]; then
  echo "FAIL: non-PDF accepted"
  cat /tmp/sidecar-bad.json
  exit 1
fi
echo "bad_pdf_http=$bad"

TMP_PDF="$(mktemp -t orgos-esign-XXXXXX.pdf)"
printf '%%PDF-1.4\nsmoke\n%%%%EOF\n' >"$TMP_PDF"
B64="$(base64 <"$TMP_PDF" | tr -d '\n')"
rm -f "$TMP_PDF"

echo "=== create unsigned asice ==="
curl -sS -o /tmp/sidecar-create.json -w '%{http_code}\n' \
  -X POST "${ORGOS_DIGIDOC_SIDECAR_URL}/container/create" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d "{\"filename\":\"smoke.pdf\",\"document\":\"${B64}\"}" | tee /tmp/sidecar-http.txt
HTTP="$(tail -1 /tmp/sidecar-http.txt)"
if [[ "$HTTP" != "200" ]]; then
  echo "FAIL: create HTTP $HTTP"
  cat /tmp/sidecar-create.json
  exit 1
fi
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const j = JSON.parse(readFileSync("/tmp/sidecar-create.json","utf8"));
if (!j.ok || !j.document) { console.error(j); process.exit(1); }
writeFileSync("/tmp/smoke.asice", Buffer.from(j.document, "base64"));
console.log("asice_bytes", Buffer.from(j.document, "base64").length);
'

echo "=== orgos esign ready (token must not appear) ==="
READY_JSON="$(node --import tsx src/cli.ts --tenant mal operations esign ready --json)"
echo "$READY_JSON" | node -e '
const j = JSON.parse(require("fs").readFileSync(0,"utf8"));
const raw = JSON.stringify(j);
if (raw.includes(process.env.ORGOS_DIGIDOC_SIDECAR_TOKEN)) {
  console.error("FAIL: token leaked in ready JSON");
  process.exit(1);
}
if (!Object.prototype.hasOwnProperty.call(j, "sidecar_token_configured")) {
  console.error("FAIL: missing sidecar_token_configured");
  process.exit(1);
}
console.log("ready_ok commercial_esp=", j.commercial_esp, "token_configured=", j.sidecar_token_configured);
'

echo "SMOKE PASS"
