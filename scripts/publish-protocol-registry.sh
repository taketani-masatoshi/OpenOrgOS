#!/usr/bin/env bash
# Mirror platform protocol registries for oorgos.org publication.
# Operator copies publish/protocol/* to https://oorgos.org/protocol/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DEST="$ROOT/publish/protocol"
mkdir -p "$DEST"
cp "$ROOT/steward/platform/protocol/wire-trust-registry.yaml" "$DEST/"
cp "$ROOT/steward/platform/protocol/trusted-hubs.yaml" "$DEST/"
cp "$ROOT/steward/platform/protocol/gov-gateway-adapters.yaml" "$DEST/"
npm run orgos -- protocol community export
echo "✓ Published mirrors → publish/protocol/"
ls -la "$DEST"
