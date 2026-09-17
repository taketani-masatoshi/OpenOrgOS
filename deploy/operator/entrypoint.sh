#!/bin/sh
# OrgOS Operator Console (local/auth-on) — alpine-compatible
# Workspace is mounted at ORGOS_WORKSPACE. Core lives in ORGOS_HOME.
# Single-tenant product: LEDGER_DATA binds to /workspace/tenants/$ORGOS_TENANT.
set -eu

ORGOS_HOME="${ORGOS_HOME:-/opt/orgos}"
ORGOS_WORKSPACE="${ORGOS_WORKSPACE:-/workspace}"

export ORGOS_HOME ORGOS_WORKSPACE
export PATH="${ORGOS_HOME}/bin:${PATH}"
export ORGOS_TENANT="${ORGOS_TENANT:-mal}"
export ORGOS_ENV="${ORGOS_ENV:-development}"

TENANT_DIR="${ORGOS_WORKSPACE}/tenants/${ORGOS_TENANT}"
if [ ! -f "${TENANT_DIR}/tenant.yaml" ]; then
  echo "[orgos-operator] ERROR: tenant.yaml not found at ${TENANT_DIR}/tenant.yaml" >&2
  echo "[orgos-operator] Mount the tenant directory at ${TENANT_DIR} (see deploy/product/.env.ledger.example)." >&2
  exit 1
fi

# Minimal workspace stub for product mounts that only provide tenants/<id>.
if [ ! -f "${ORGOS_WORKSPACE}/orgos.yaml" ]; then
  printf '%s\n' "version: 1" "workspace: ledger" > "${ORGOS_WORKSPACE}/orgos.yaml"
  echo "[orgos-operator] wrote minimal ${ORGOS_WORKSPACE}/orgos.yaml"
fi

mkdir -p "${ORGOS_WORKSPACE}/product-fleet" "${ORGOS_WORKSPACE}/data/.orgos"

# SPA paths resolve from process.cwd()/apps/... — keep cwd at Core install root
cd "${ORGOS_HOME}"

if [ "${1:-}" = "orgos" ]; then
  shift
  # Prefer ORGOS_TENANT when command embeds a stale --tenant (image default).
  set -- "$@"
  exec node "${ORGOS_HOME}/bin/orgos.js" "$@"
fi

exec "$@"
