#!/usr/bin/env bash
# Deploy Operator Console to southwood production host.
# Usage: DEPLOY_HOST=user@server DEPLOY_PATH=/opt/orgos-reference bash scripts/deploy-southwood.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/orgos-reference}"
OPERATOR_URL="${OPERATOR_URL:-https://operator.southwood.inc}"

if [[ -z "${DEPLOY_HOST}" ]]; then
  echo "Set DEPLOY_HOST (e.g. user@mac-mini) and re-run."
  echo "Example:"
  echo "  DEPLOY_HOST=admin@mac-mini DEPLOY_PATH=/opt/orgos-reference bash scripts/deploy-southwood.sh"
  exit 1
fi

cd "$ROOT"
npm run operator-console:build

echo "Syncing to ${DEPLOY_HOST}:${DEPLOY_PATH}…"
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude 'data/.orgos' \
  --exclude 'tenants/*/data' \
  "$ROOT/" "${DEPLOY_HOST}:${DEPLOY_PATH}/"

ssh "${DEPLOY_HOST}" "cd ${DEPLOY_PATH} && npm ci && npm run operator-console:build"

echo "Installing systemd unit…"
ssh "${DEPLOY_HOST}" "sudo cp ${DEPLOY_PATH}/deploy/operator-console/systemd/steward-operator-console@.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now steward-operator-console@demo"

echo "Starting witness hubs (docker)…"
ssh "${DEPLOY_HOST}" "cd ${DEPLOY_PATH} && docker compose -f deploy/witness-hub/docker-compose.yaml up -d"

echo "Running prod verify…"
npm run prod:verify -- --url "${OPERATOR_URL}" --tenant demo \
  --hub-url "http://${DEPLOY_HOST}:9474" --hub-url "http://${DEPLOY_HOST}:9475" || true

echo "Done — confirm DNS ${OPERATOR_URL} → host and TLS certs in deploy/operator-console/nginx/certs/"
