#!/usr/bin/env bash
# Restore Operator Console PassKey state from a snapshot under .orgos/snapshots/.
#
# Usage:
#   ./scripts/operator-passkey-restore.sh --list
#   ./scripts/operator-passkey-restore.sh 20260827T154500Z-passkey-known-good
#   ./scripts/operator-passkey-restore.sh latest
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="${ORGOS_WORKSPACE:-$ROOT}"
STATE_DIR="${WORKSPACE}/.orgos"
SNAP_ROOT="${STATE_DIR}/snapshots"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <snapshot-id|latest|--list>" >&2
  exit 1
fi

arg="$1"
if [[ "$arg" == "--list" ]]; then
  exec "$(dirname "$0")/operator-passkey-snapshot.sh" --list
fi

if [[ "$arg" == "latest" ]]; then
  if [[ ! -d "$SNAP_ROOT" ]]; then
    echo "No snapshots directory: ${SNAP_ROOT}" >&2
    exit 1
  fi
  arg="$(ls -1dt "${SNAP_ROOT}"/*/ 2>/dev/null | head -1 | xargs basename)"
  if [[ -z "$arg" ]]; then
    echo "No snapshots found" >&2
    exit 1
  fi
  echo "Using latest snapshot: ${arg}"
fi

src="${SNAP_ROOT}/${arg}"
if [[ ! -d "$src" ]]; then
  echo "Snapshot not found: ${src}" >&2
  echo "Run: ./scripts/operator-passkey-snapshot.sh --list" >&2
  exit 1
fi

if [[ "${OPERATOR_PASSKEY_RESTORE_YES:-}" != "1" ]]; then
  echo "This will overwrite files in ${STATE_DIR}"
  [[ -f "${src}/manifest.yaml" ]] && cat "${src}/manifest.yaml"
  echo ""
  echo "Re-run with: OPERATOR_PASSKEY_RESTORE_YES=1 $0 ${arg}"
  exit 0
fi

pre="${SNAP_ROOT}/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$pre"
for f in wire-console-webauthn-credentials.json settlement-challenges.json webauthn-challenges.json webauthn-sign-counts.json passkey-bootstrap.json; do
  if [[ -f "${STATE_DIR}/${f}" ]]; then
    cp -p "${STATE_DIR}/${f}" "${pre}/${f}"
  fi
done
echo "Pre-restore backup → ${pre}"

restore_file() {
  local name="$1"
  if [[ -f "${src}/${name}" ]]; then
    cp -p "${src}/${name}" "${STATE_DIR}/${name}"
    echo "  restored ${name}"
  fi
}

mkdir -p "$STATE_DIR"
restore_file "wire-console-webauthn-credentials.json"
restore_file "settlement-challenges.json"
restore_file "webauthn-challenges.json"
restore_file "webauthn-sign-counts.json"
restore_file "passkey-bootstrap.json"

echo ""
echo "State restored from ${arg}"
echo "Next:"
echo "  cd /Users/kk/OS_Community && docker restart os_community-operator-console-1"
echo "  open http://localhost:9470/approvals/"
