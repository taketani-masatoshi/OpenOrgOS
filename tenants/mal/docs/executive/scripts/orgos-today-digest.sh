#!/usr/bin/env bash
# MAL · Today digest（CLI · LLM なし）
# launchd / cron から呼ばれる。ORGOS_TENANT=mal 固定。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$ROOT"

export ORGOS_TENANT="${ORGOS_TENANT:-mal}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

STAMP="$(date +%Y-%m-%d-%H%M)"
SLOT="$(date +%H%M)"
OUT_DIR="$ROOT/tenants/mal/docs/reports/dashboard/today-digest"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/${STAMP}-today.md"
LATEST="$OUT_DIR/latest.md"
ERR_FILE="$OUT_DIR/.today-digest.err"
LOG="${ORGOS_TODAY_DIGEST_LOG:-/tmp/orgos-mal-today-digest.log}"

{
  echo "=== orgos today digest · $STAMP · tenant=$ORGOS_TENANT ==="
  if [[ -f "$ROOT/tenants/mal/records/executive/smtp.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/tenants/mal/records/executive/smtp.env"
    set +a
  elif [[ -f "$ROOT/deploy/mal-pilot/env/.env.mail-wire" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/deploy/mal-pilot/env/.env.mail-wire"
    set +a
  fi

  {
    echo "# Today digest · ${STAMP}"
    echo ""
    echo "> 生成: \`orgos chat today\`（決定論 CLI · LLM なし）· tenant \`${ORGOS_TENANT}\`"
    echo ">"
    echo "> スロット目安: 0900 仕事開始 / 1300 午後開始 / 1700 夕方確認"
    echo ""
  } >"$OUT_FILE"

  set +e
  node --import tsx "$ROOT/src/cli.ts" chat today >>"$OUT_FILE" 2>"$ERR_FILE"
  rc=$?
  set -e

  if [[ $rc -ne 0 ]] || ! grep -q '^\*\*結論:\*\*' "$OUT_FILE"; then
    echo "✗ orgos chat today failed (rc=$rc) — see $ERR_FILE" >&2
    cat "$ERR_FILE" >&2 || true
    exit 1
  fi
  rm -f "$ERR_FILE"
  cp "$OUT_FILE" "$LATEST"

  SUMMARY="$(grep -m1 '^\*\*結論:\*\*' "$OUT_FILE" | sed 's/^\*\*結論:\*\*[[:space:]]*//' || true)"
  if [[ -z "$SUMMARY" ]]; then
    SUMMARY="Today を更新しました（${SLOT}）"
  fi
  SUMMARY="${SUMMARY:0:100}"
  SUMMARY_SAFE="$(printf '%s' "$SUMMARY" | tr -d "\"'")"

  /usr/bin/osascript -e "display notification \"${SUMMARY_SAFE}\" with title \"MAL · Today ${SLOT}\" subtitle \"today-digest/latest.md\"" || true

  echo "✓ wrote $OUT_FILE"
  echo "✓ latest → $LATEST"
} >>"$LOG" 2>&1
