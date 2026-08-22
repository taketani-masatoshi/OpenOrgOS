#!/bin/sh
# OrgOS Operator Console (local/auth-on) — alpine-compatible
# Workspace is mounted at ORGOS_WORKSPACE (host OS_Steward). Core lives in ORGOS_HOME.
set -eu

ORGOS_HOME="${ORGOS_HOME:-/opt/orgos}"
ORGOS_WORKSPACE="${ORGOS_WORKSPACE:-/workspace}"

export ORGOS_HOME ORGOS_WORKSPACE
export PATH="${ORGOS_HOME}/bin:${PATH}"
export ORGOS_TENANT="${ORGOS_TENANT:-mal}"
export ORGOS_ENV="${ORGOS_ENV:-development}"

if [ ! -d "${ORGOS_WORKSPACE}/tenants/${ORGOS_TENANT}" ]; then
  echo "[orgos-operator] ERROR: tenant '${ORGOS_TENANT}' not found under ${ORGOS_WORKSPACE}/tenants" >&2
  echo "[orgos-operator] Mount the OS_Steward checkout as ORGOS_WORKSPACE." >&2
  exit 1
fi

if [ ! -f "${ORGOS_WORKSPACE}/orgos.yaml" ] && [ ! -d "${ORGOS_WORKSPACE}/tenants" ]; then
  echo "[orgos-operator] ERROR: ${ORGOS_WORKSPACE} is not an OrgOS workspace" >&2
  exit 1
fi

# SPA paths resolve from process.cwd()/apps/... — keep cwd at Core install root
cd "${ORGOS_HOME}"

if [ "${1:-}" = "orgos" ]; then
  shift
  exec node "${ORGOS_HOME}/bin/orgos.js" "$@"
fi

exec "$@"
