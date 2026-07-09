#!/usr/bin/env bash
# Verify GHCR-published orgos-demo image (B1–B2)
# Design: docs/org-os/demo-docker.md
#
# Usage:
#   bash deploy/demo/verify-ghcr.sh
#   ORGOS_DEMO_IMAGE=ghcr.io/my-org/orgos-demo:0.8.0 bash deploy/demo/verify-ghcr.sh
#   npm run demo:docker:verify-ghcr
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${1:-${ORGOS_DEMO_IMAGE:-ghcr.io/taketani-masatoshi/orgos-demo:main}}"
CONTAINER_NAME="${ORGOS_DEMO_VERIFY_CONTAINER:-orgos-demo-verify}"
VOLUME_NAME="${ORGOS_DEMO_VERIFY_VOLUME:-orgos-demo-workspace-verify}"
HOST_BIND="${ORGOS_DEMO_HOST_BIND:-127.0.0.1:9470:9470}"

cleanup() {
  docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true
}
trap cleanup EXIT

echo "B1 — docker pull ${IMAGE}"
if ! docker pull "${IMAGE}"; then
  echo "" >&2
  echo "FAIL: pull failed. If the package is private:" >&2
  echo "  echo \"\$GITHUB_TOKEN\" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin" >&2
  echo "  (PAT needs read:packages) · or set Package visibility to Public in GitHub → Packages" >&2
  exit 1
fi
echo "✓ B1 pull OK"

cleanup
docker run -d \
  --name "${CONTAINER_NAME}" \
  -p "${HOST_BIND}" \
  -v "${VOLUME_NAME}:/workspace" \
  "${IMAGE}"

echo "B2 — acceptance against pulled image"
ORGOS_DEMO_WAIT_SEC="${ORGOS_DEMO_WAIT_SEC:-120}" bash "${ROOT}/deploy/demo/acceptance.sh"
echo "OK — GHCR verify passed (${IMAGE})"
