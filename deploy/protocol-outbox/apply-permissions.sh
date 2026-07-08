#!/usr/bin/env bash
# Apply protocol outbox/inbox/data directory permissions for production deploy.
# Requires root for chown; chmod runs as invoking user when not root.
#
# Usage:
#   sudo ORGOS_ROOT=/opt/orgos-reference ./apply-permissions.sh mal
#   ORGOS_ROOT=/opt/orgos-reference STEWARD_USER=steward ./apply-permissions.sh demo
# Legacy: STEWARD_ROOT=/opt/orgos-reference (still supported)

set -euo pipefail

TENANT="${1:?usage: apply-permissions.sh <tenant-id>}"
ROOT="${ORGOS_ROOT:-${STEWARD_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}}"
USER_NAME="${STEWARD_USER:-steward}"
GROUP_NAME="${STEWARD_GROUP:-steward}"

cd "$ROOT"

exec npm run orgos -- --tenant "$TENANT" protocol outbox apply-permissions \
  --user "$USER_NAME" \
  --group "$GROUP_NAME"
