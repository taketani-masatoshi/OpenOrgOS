#!/usr/bin/env bash
# Point this repository at the tracked .githooks directory.
# Without this, .githooks/pre-commit and pre-push never run.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
git -C "$root" config core.hooksPath .githooks
echo "✓ core.hooksPath=.githooks ($root)"
echo "Verify: git config --get core.hooksPath"
