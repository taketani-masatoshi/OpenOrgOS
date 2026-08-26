#!/usr/bin/env bash
# Save Operator Console PassKey / settlement state for rollback.
# Writes under ${ORGOS_WORKSPACE}/.orgos/snapshots/<id>/ (gitignored).
#
# Usage:
#   ./scripts/operator-passkey-snapshot.sh
#   ./scripts/operator-passkey-snapshot.sh --label after-ceo-approval-fix
#   ./scripts/operator-passkey-snapshot.sh --list
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="${ORGOS_WORKSPACE:-$ROOT}"
STATE_DIR="${WORKSPACE}/.orgos"
SNAP_ROOT="${STATE_DIR}/snapshots"

label=""
list_only=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label)
      label="${2:-}"
      shift 2
      ;;
    --list)
      list_only=1
      shift
      ;;
    -h | --help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$list_only" -eq 1 ]]; then
  if [[ ! -d "$SNAP_ROOT" ]]; then
    echo "No snapshots yet (${SNAP_ROOT})"
    exit 0
  fi
  echo "Snapshots in ${SNAP_ROOT}:"
  ls -1dt "${SNAP_ROOT}"/*/ 2>/dev/null | while read -r d; do
    id="$(basename "$d")"
    when=""
    if [[ -f "${d}manifest.yaml" ]]; then
      when="$(grep -E '^created_at:' "${d}manifest.yaml" | head -1 | sed 's/^created_at:[[:space:]]*//')"
    fi
    echo "  ${id}${when:+  (${when})}"
  done
  exit 0
fi

slug="${label:-passkey-known-good}"
slug="$(printf '%s' "$slug" | tr ' /' '--' | tr -cd '[:alnum:]._-' | cut -c1-48)"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
snap_id="${ts}-${slug}"
dest="${SNAP_ROOT}/${snap_id}"
mkdir -p "$dest"

copy_if_exists() {
  local name="$1"
  if [[ -f "${STATE_DIR}/${name}" ]]; then
    cp -p "${STATE_DIR}/${name}" "${dest}/${name}"
    echo "  + ${name}"
  fi
}

echo "Operator PassKey snapshot → ${dest}"
echo "Workspace: ${WORKSPACE}"

git_ref=""
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_ref="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || true)"
  git -C "$ROOT" status --short >> "${dest}/git-status.txt" 2>/dev/null || true
fi

tenant="${ORGOS_TENANT:-mal}"
copy_if_exists "wire-console-webauthn-credentials.json"
copy_if_exists "settlement-challenges.json"
copy_if_exists "webauthn-challenges.json"
copy_if_exists "webauthn-sign-counts.json"
copy_if_exists "passkey-bootstrap.json"

# L1 env only — no OIDC secrets
{
  echo "ORGOS_TENANT=${tenant}"
  echo "ORGOS_WORKSPACE=${WORKSPACE}"
  echo "WIRE_CONSOLE_WEBAUTHN_RP_ID=${WIRE_CONSOLE_WEBAUTHN_RP_ID:-localhost}"
  echo "WIRE_CONSOLE_WEBAUTHN_ORIGIN=${WIRE_CONSOLE_WEBAUTHN_ORIGIN:-http://localhost:9470}"
  echo "ORGOS_SETTLEMENT_STEPUP=${ORGOS_SETTLEMENT_STEPUP:-1}"
  echo "ORGOS_SETTLEMENT_RP_ID=${ORGOS_SETTLEMENT_RP_ID:-localhost}"
  echo "ORGOS_SETTLEMENT_APPROVE_ORIGIN=${ORGOS_SETTLEMENT_APPROVE_ORIGIN:-http://localhost:4178}"
} > "${dest}/env-operator-console.txt"

cred_summary=""
if [[ -f "${dest}/wire-console-webauthn-credentials.json" ]]; then
  cred_summary="$(node --input-type=module -e "
    import { readFileSync } from 'node:fs';
    const j = JSON.parse(readFileSync('${dest}/wire-console-webauthn-credentials.json','utf8'));
    for (const c of j.credentials ?? []) {
      console.log('- id: ' + c.credential_id + ' purpose: ' + c.purpose + ' approver_id: ' + c.approver_id + ' rp_id: ' + c.rp_id);
    }
  " 2>/dev/null || true)"
fi

{
  echo "id: ${snap_id}"
  echo "created_at: ${ts}"
  echo "tenant: ${tenant}"
  echo "workspace: ${WORKSPACE}"
  echo "git_ref: ${git_ref}"
  echo "label: ${slug}"
  echo "restore: ./scripts/operator-passkey-restore.sh ${snap_id}"
  echo "credentials:"
  if [[ -n "$cred_summary" ]]; then
    printf '%s\n' "$cred_summary" | sed 's/^/  /'
  else
    echo "  (none captured)"
  fi
} > "${dest}/manifest.yaml"

echo ""
echo "Done. manifest: ${dest}/manifest.yaml"
echo "Restore:  ./scripts/operator-passkey-restore.sh ${snap_id}"
