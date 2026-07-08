#!/usr/bin/env bash
# Generate dev TLS for Witness Hub stack (never use in production).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
npm run orgos -- hub tls-init "$@"
