#!/usr/bin/env bash
# Isolated full Vitest run — waits for other vitest, then runs under a lock.
# Usage: ./scripts/run-full-test-isolated.sh [vitest args...]
# Env: FULL_TEST_WAIT_SEC (default 900) — max seconds to wait for another vitest
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOCK="$ROOT/scratch/full-test.lock"
mkdir -p "$ROOT/scratch"
WAIT_SEC="${FULL_TEST_WAIT_SEC:-900}"

vitest_running() {
  pgrep -f '[n]ode \(vitest|[n]px vitest|[n]ode.*vitest|[n]ode --import tsx scripts/run-tests' >/dev/null 2>&1
}

if vitest_running; then
  echo "… Another vitest/run-tests is running — waiting up to ${WAIT_SEC}s" >&2
  end=$(( $(date +%s) + WAIT_SEC ))
  while vitest_running && [[ $(date +%s) -lt $end ]]; do
    sleep 10
  done
  if vitest_running; then
    echo "✗ Another vitest process is still running after ${WAIT_SEC}s" >&2
    exit 1
  fi
  echo "✓ Other vitest finished — continuing" >&2
  sleep 2
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
tail -50 "$LOG"
echo "exit:$code log:$LOG"
exit "$code"
