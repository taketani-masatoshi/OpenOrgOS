#!/usr/bin/env bash
# Isolated full Vitest run — refuses if another vitest is already running.
# Usage: ./scripts/run-full-test-isolated.sh [vitest args...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOCK="$ROOT/scratch/full-test.lock"
mkdir -p "$ROOT/scratch"

if pgrep -f '[n]ode \(vitest|[n]px vitest|[n]ode.*vitest' >/dev/null 2>&1; then
  echo "✗ Another vitest process is running — stop it (or wait) before full suite" >&2
  exit 1
fi

if [[ -f "$LOCK" ]]; then
  age=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK") ))
  if [[ "$age" -lt 7200 ]]; then
    echo "✗ Lock present: $LOCK (age ${age}s) — remove if stale" >&2
    exit 1
  fi
  rm -f "$LOCK"
fi

echo "$$ $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

LOG="$ROOT/scratch/full-test-$(date -u +%Y%m%dT%H%M%SZ).log"
echo "=== Isolated npm test → $LOG ==="
set +e
npm test "$@" >"$LOG" 2>&1
code=$?
set -e
tail -40 "$LOG"
echo "exit:$code log:$LOG"
exit "$code"
