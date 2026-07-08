#!/bin/sh
# OrgOS Demo entrypoint — seed workspace then exec Operator Console
# Design: docs/org-os/demo-docker.md · alpine-compatible (no bash)
set -eu

ORGOS_HOME="${ORGOS_HOME:-/opt/orgos}"
ORGOS_WORKSPACE="${ORGOS_WORKSPACE:-/workspace}"
SEED_DIR="${ORGOS_SEED_DIR:-${ORGOS_HOME}/seed}"

export ORGOS_HOME ORGOS_WORKSPACE
export PATH="${ORGOS_HOME}/bin:${PATH}"
export ORGOS_TENANT="${ORGOS_TENANT:-demo}"

mkdir -p "${ORGOS_WORKSPACE}"

if [ ! -f "${ORGOS_WORKSPACE}/orgos.yaml" ]; then
  echo "[orgos-demo] Initializing workspace from seed…"
  if [ ! -d "${SEED_DIR}" ]; then
    echo "[orgos-demo] ERROR: seed missing at ${SEED_DIR}" >&2
    exit 1
  fi
  cp -a "${SEED_DIR}/." "${ORGOS_WORKSPACE}/"
  echo "[orgos-demo] Seeded ${ORGOS_WORKSPACE}"
else
  echo "[orgos-demo] Existing workspace detected — skip seed"
fi

if [ "${ORGOS_ENV:-}" = "demo" ] || [ "${STEWARD_CHAT_AUTH:-}" = "0" ]; then
  echo "[orgos-demo] WARNING: Demo mode — auth disabled/relaxed. Use 127.0.0.1 only. Not for production." >&2
fi

# SPA paths resolve from process.cwd()/apps/... — keep cwd at Core install root
cd "${ORGOS_HOME}"

if [ "${1:-}" = "orgos" ]; then
  shift
  exec node "${ORGOS_HOME}/bin/orgos.js" "$@"
fi

exec "$@"
