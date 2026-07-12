#!/usr/bin/env bash
# mal Wire pilot hygiene — signing key · gateway DID · mail-config · PEER-003
# Does NOT rotate keys. Run before live verify / ship-gate / after Vitest.
# Usage: ./scripts/mal-wire-hygiene.sh [tenant=mal]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TENANT="${1:-mal}"
cd "$ROOT"
export ORGOS_TENANT="$TENANT"
# Opt-in: rewrite platform + publish trust registry to match operational key
export ORGOS_HYGIENE_UPDATE_TRUST_REGISTRY=1

EXAMPLE="$ROOT/deploy/mal-pilot/mail-config.mal-pilot.yaml.example"
MAIL_DIR="$ROOT/tenants/$TENANT/records/executive"
mkdir -p "$MAIL_DIR"
if [[ -f "$EXAMPLE" ]]; then
  if [[ ! -f "$MAIL_DIR/mail-config.mal-pilot.yaml.example" ]]; then
    cp "$EXAMPLE" "$MAIL_DIR/mail-config.mal-pilot.yaml.example"
  fi
  if [[ ! -f "$MAIL_DIR/mail-config.yaml" ]]; then
    cp "$EXAMPLE" "$MAIL_DIR/mail-config.yaml"
    chmod 600 "$MAIL_DIR/mail-config.yaml"
    echo "✓ Restored mail-config.yaml from deploy example"
  fi
fi

npm run orgos -- protocol wire-hygiene --tenant "$TENANT"
