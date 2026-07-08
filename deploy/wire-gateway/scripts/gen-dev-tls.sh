#!/usr/bin/env bash
# Generate dev TLS for Wire Gateway stack (never use in production).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
npm run orgos -- wire-gateway tls-init "$@"
