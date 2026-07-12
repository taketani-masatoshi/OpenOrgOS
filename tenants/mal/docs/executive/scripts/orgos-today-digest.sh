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

  # 通知: 件数は subtitle、本文は先頭の要対応項目（パスではなく中身）
  COUNTS="$(grep -m1 '^\*\*結論:\*\*' "$OUT_FILE" | sed 's/^\*\*結論:\*\*[[:space:]]*//; s/ · 再試行 0 件//; s/ 件//g' || true)"
  [[ -n "$COUNTS" ]] || COUNTS="Today 更新"

  # 「- **タイトル**（…）」のタイトルだけ最大 2 件
  BODY="$(
    grep -E '^- \*\*' "$OUT_FILE" \
      | sed -E 's/^- \*\*//; s/\*\*.*$//; s/[[:space:]]+$//' \
      | head -2 \
      | awk '{ if (NR>1) printf " / "; printf "%s", $0 } END { print "" }' \
      || true
  )"
  if [[ -z "$BODY" ]]; then
    BODY="詳細は today-digest/latest.md"
  fi

  SLOT_HM="$(date +%H:%M)"
  TITLE="MAL Today · ${SLOT_HM}"
  SUB="${COUNTS:0:60}"
  MSG="${BODY:0:110}"
  # 引用符除去（AppleScript argv）
  TITLE_S="$(printf '%s' "$TITLE" | tr -d "\"'")"
  SUB_S="$(printf '%s' "$SUB" | tr -d "\"'")"
  MSG_S="$(printf '%s' "$MSG" | tr -d "\"'")"

  # カスタムアイコン付き MAL Today.app（UNUserNotificationCenter）
  NOTIFY_BIN="$ROOT/tenants/mal/docs/executive/apps/MAL Today.app/Contents/MacOS/MALToday"
  if [[ -x "$NOTIFY_BIN" ]]; then
    "$NOTIFY_BIN" "$TITLE_S" "$SUB_S" "$MSG_S" 2>>"$LOG" || true
  else
    /usr/bin/osascript -e "display notification \"${MSG_S}\" with title \"${TITLE_S}\" subtitle \"${SUB_S}\"" || true
  fi

  echo "✓ wrote $OUT_FILE"
  echo "✓ latest → $LATEST"
  echo "✓ notify: ${TITLE_S} | ${SUB_S} | ${MSG_S}"
} >>"$LOG" 2>&1
