#!/usr/bin/env zsh
# 経理精度 3 ループ × N 回
# Loop 1 (L0): payroll-jp 単体テスト × N（Vitest fixture restore あり）
# Loop 2 (L1): monthly-reconcile × N（bootstrap close 後の GL 前提）
# Loop 3 (L2): monthly-reconcile + kessan --compare × N
#
# 既定は直列。loop1 の fixture restore が bootstrap GL を消すため、
# reconcile/kessan を先に走らせ、payroll は最後。並行は FINANCE_LOOP_PARALLEL=1。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TENANT="${ORGOS_TENANT:-_fixture-books}"
MONTH="${FINANCE_LOOP_MONTH:-2026-09}"
FY="${FINANCE_LOOP_FY:-FY2026}"
ROUNDS="${FINANCE_LOOP_ROUNDS:-10}"
PARALLEL="${FINANCE_LOOP_PARALLEL:-0}"
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

echo "Bootstrap: seed GL for $MONTH (once, before reconcile loops)"
acquire_lock
if ! npm run orgos -- finances close --month "$MONTH" >>"$LOG_DIR/bootstrap.log" 2>&1; then
  release_lock
  echo "FAIL bootstrap finances close --month $MONTH"
  tail -40 "$LOG_DIR/bootstrap.log" || true
  exit 1
fi
release_lock

run_loop1() {
  local log="$LOG_DIR/loop1-test.log"
  : >"$log"
  for i in $(seq 1 "$ROUNDS"); do
    echo "=== Loop1 round $i/$ROUNDS $(date -Iseconds) ===" >>"$log"
    # Vitest global setup can rewrite tenant fixtures; serialize against loop2/3.
    acquire_lock
    if ! npx vitest run --maxWorkers=1 tests/payroll-jp.test.ts >>"$log" 2>&1; then
      release_lock
      echo "FAIL loop1 round $i" >>"$log"
      return 1
    fi
    release_lock
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
    if grep -q "balanced=false" "$round_log"; then
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
    if [[ "$rc" -eq 0 ]] && ! grep -q "balanced=false" "$round_log"; then
      npm run orgos -- report kessan --fy "$FY" --basis gl --compare >>"$round_log" 2>&1 || rc=$?
    fi
    release_lock
    if [[ "$rc" -ne 0 ]]; then
      echo "FAIL loop3 round $i" >>"$log"
      cat "$round_log" >>"$log"
      return 1
    fi
    if grep -q "balanced=false" "$round_log"; then
      echo "FAIL loop3 balanced=false round $i" >>"$log"
      cat "$round_log" >>"$log"
      return 1
    fi
    cat "$round_log" >>"$log"
    echo "OK loop3 round $i" >>"$log"
  done
  echo "LOOP3_PASS $ROUNDS" >>"$log"
}

FAIL=0
if [[ "$PARALLEL" == "1" ]]; then
  echo "Starting 3 loops × $ROUNDS rounds in parallel (tenant=$TENANT month=$MONTH)"
  echo "Logs: $LOG_DIR"
  # Parallel stress: still lock around tenant mutations; order races remain possible.
  run_loop1 &
  PID1=$!
  run_loop2 &
  PID2=$!
  run_loop3 &
  PID3=$!
  wait "$PID1" || FAIL=1
  wait "$PID2" || FAIL=2
  wait "$PID3" || FAIL=3
else
  echo "Starting 3 loops × $ROUNDS rounds sequentially (tenant=$TENANT month=$MONTH)"
  echo "Logs: $LOG_DIR"
  # Reconcile/kessan before Vitest so fixture restore cannot wipe bootstrap GL.
  run_loop2 || FAIL=2
  if [[ "$FAIL" -eq 0 ]]; then
    run_loop3 || FAIL=3
  fi
  if [[ "$FAIL" -eq 0 ]]; then
    run_loop1 || FAIL=1
  fi
fi

echo ""
echo "========== SUMMARY =========="
for f in loop2-reconcile.log loop3-compare.log loop1-test.log; do
  echo "--- $f ---"
  if [[ -f "$LOG_DIR/$f" ]]; then
    tail -6 "$LOG_DIR/$f"
  else
    echo "(missing)"
  fi
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAILED (loop exit marker: $FAIL)"
  exit 1
fi

echo "ALL LOOPS PASSED ($ROUNDS rounds each)"
exit 0
