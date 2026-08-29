#!/usr/bin/env zsh
# 経理精度 3 ループ × N 回（並行）
# Loop 1 (L0): payroll-jp 単体テスト × N（テナント非破壊 · 他ループと並行可）
# Loop 2 (L1): close(初回) → monthly-reconcile × N
# Loop 3 (L2): monthly-reconcile + kessan --compare × N
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TENANT="${ORGOS_TENANT:-_fixture-books}"
MONTH="${FINANCE_LOOP_MONTH:-2026-09}"
FY="${FINANCE_LOOP_FY:-FY2026}"
ROUNDS="${FINANCE_LOOP_ROUNDS:-10}"
LOG_DIR="/tmp/orgos-finance-loops-${TENANT}-$$"
LOCK_DIR="/tmp/orgos-finance-loop-lock-${TENANT}"
mkdir -p "$LOG_DIR"

cd "$ROOT"
export ORGOS_TENANT="$TENANT"

acquire_lock() {
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do sleep 0.25; done
}
release_lock() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

echo "Preflight: integration tests (once)"
npx vitest run --maxWorkers=1 \
  tests/journal-source-accounts.test.ts \
  tests/ledger-cutover.test.ts \
  tests/ledger-monthly-reconcile.test.ts \
  tests/annual-close.test.ts

echo "Bootstrap: seed GL for $MONTH (once, before parallel loops)"
acquire_lock
npm run orgos -- finances close --month "$MONTH" >>"$LOG_DIR/bootstrap.log" 2>&1 || true
release_lock

run_loop1() {
  local log="$LOG_DIR/loop1-test.log"
  : >"$log"
  for i in $(seq 1 "$ROUNDS"); do
    echo "=== Loop1 round $i/$ROUNDS $(date -Iseconds) ===" >>"$log"
    if ! npx vitest run --maxWorkers=1 tests/payroll-jp.test.ts >>"$log" 2>&1; then
      echo "FAIL loop1 round $i" >>"$log"
      return 1
    fi
    echo "OK loop1 round $i" >>"$log"
  done
  echo "LOOP1_PASS $ROUNDS" >>"$log"
}

run_loop2() {
  local log="$LOG_DIR/loop2-reconcile.log"
  : >"$log"
  for i in $(seq 1 "$ROUNDS"); do
    echo "=== Loop2 round $i/$ROUNDS $(date -Iseconds) ===" >>"$log"
    acquire_lock
    local round_log="$LOG_DIR/loop2-round-${i}.log"
    npm run orgos -- ledger monthly-reconcile --month "$MONTH" >"$round_log" 2>&1
    local rc=$?
    release_lock
    if [[ "$rc" -ne 0 ]]; then
      echo "FAIL loop2 reconcile command round $i" >>"$log"
      cat "$round_log" >>"$log"
      return 1
    fi
    if rg -q "balanced=false" "$round_log"; then
      echo "FAIL loop2 balanced=false round $i" >>"$log"
      cat "$round_log" >>"$log"
      return 1
    fi
    cat "$round_log" >>"$log"
    echo "OK loop2 round $i" >>"$log"
  done
  echo "LOOP2_PASS $ROUNDS" >>"$log"
}

run_loop3() {
  local log="$LOG_DIR/loop3-compare.log"
  : >"$log"
  for i in $(seq 1 "$ROUNDS"); do
    echo "=== Loop3 round $i/$ROUNDS $(date -Iseconds) ===" >>"$log"
    acquire_lock
    local round_log="$LOG_DIR/loop3-round-${i}.log"
    : >"$round_log"
    npm run orgos -- ledger monthly-reconcile --month "$MONTH" >>"$round_log" 2>&1
    local rc=$?
    if [[ "$rc" -eq 0 ]] && ! rg -q "balanced=false" "$round_log"; then
      npm run orgos -- report kessan --fy "$FY" --basis gl --compare >>"$round_log" 2>&1 || rc=$?
    fi
    release_lock
    if [[ "$rc" -ne 0 ]]; then
      echo "FAIL loop3 round $i" >>"$log"
      cat "$round_log" >>"$log"
      return 1
    fi
    if rg -q "balanced=false" "$round_log"; then
      echo "FAIL loop3 balanced=false round $i" >>"$log"
      cat "$round_log" >>"$log"
      return 1
    fi
    cat "$round_log" >>"$log"
    echo "OK loop3 round $i" >>"$log"
  done
  echo "LOOP3_PASS $ROUNDS" >>"$log"
}

echo "Starting 3 loops × $ROUNDS rounds in parallel (tenant=$TENANT month=$MONTH)"
echo "Logs: $LOG_DIR"

run_loop1 &
PID1=$!
run_loop2 &
PID2=$!
run_loop3 &
PID3=$!

FAIL=0
wait "$PID1" || FAIL=1
wait "$PID2" || FAIL=2
wait "$PID3" || FAIL=3

echo ""
echo "========== SUMMARY =========="
for f in loop1-test.log loop2-reconcile.log loop3-compare.log; do
  echo "--- $f ---"
  tail -6 "$LOG_DIR/$f"
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAILED (loop exit marker: $FAIL)"
  exit 1
fi

echo "ALL LOOPS PASSED ($ROUNDS rounds each)"
exit 0
