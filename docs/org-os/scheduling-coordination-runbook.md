# 多者日程調整 — 運用 Runbook

**Path:** `docs/org-os/scheduling-coordination-runbook.md`  
**Skill 正本:** [schedule_coordination.md](../../steward/core/skills/schedule_coordination.md)  
**Agent:** [secretary_agent.md](../../steward/core/agents/secretary_agent.md)

---

## 1. 前提

| 項目 | 要件 |
|------|------|
| Operator | `data/org/operators.yaml` 初期化済み · `~/.orgos/operators/OP-001.key` |
| 認証 | `STEWARD_OPERATOR_AUTH=1` · `ORGOS_OPERATOR_KEY`（human mutation 時） |
| 会社メール | `data/company.yaml` → `public_disclosure.representative_email`（または `contact_email`） |
| メール設定 | `records/executive/mail-config.yaml`（L2 · gitignore）— 未作成時は `doctor --repair` が dry-run 用を生成 |
| 日程 SoT | `data/executive/scheduling-cases.yaml` · `calendar.yaml` · `ceo-inline-questions.yaml` |

---

## 2. 初回セットアップ（新規テナント）

```bash
orgos tenant init <id> --name "Your Company"
orgos tenant scaffold-data --tenant <id>
orgos operator init-registry --tenant <id>    # 初回のみ
orgos doctor --tenant <id> --repair
orgos executive scheduling rehearsal --full --tenant <id>
```

**成功条件（doctor）:** operator key · mail-config · scheduling skeleton に **ERROR なし**（WARNING は可）。

**成功条件（rehearsal）:** 案件 `closed` · Assertions 全 ✓ · `orgos validate` exit 0。

---

## 3. 本番フロー（実用）

```bash
export STEWARD_OPERATOR_AUTH=1
export ORGOS_OPERATOR_KEY="$(cat ~/.orgos/operators/OP-001.key)"

# 1. 案件 + 候補
orgos executive scheduling new --title "..." --participant "名前|email|external"
orgos executive scheduling propose --id SCH-YYYY-NNN

# 2. 提案送信（CEO / approver）
# dry-run（既定・EML のみ）:
orgos executive scheduling approve-send --id SCH-YYYY-NNN --reviewed
# 実 SMTP:
orgos executive scheduling approve-send --id SCH-YYYY-NNN --reviewed --no-dry-run

# Steward Chat 代替:
# GET  /chat/v1/approvals/{id}/scheduling-preview
# POST /chat/v1/approvals/{id}/approve
#   body: { "reviewed": true, "send": true, "dry_run": false }
# send 省略時は承認のみ（送信しない）

# 3. 返信取込
orgos mail intake sync
orgos mail intake triage          # auto_triage=false のとき必須
orgos executive scheduling auto-process
# または: orgos executive scheduling process --all

# 4. CEO 最終確認
# Steward Chat: CEO inline question に回答
# CLI フォールバック:
orgos mail intake ceo list
orgos mail intake ceo answer --id CEO-Q-... --field <fieldId> <value>

# 5. 確認
orgos executive scheduling show --id SCH-YYYY-NNN
orgos validate --tenant <id>
```

### 受信自動化（mal 等）

| `mail-config.yaml` | 挙動 |
|--------------------|------|
| `receive.auto_triage: true`（既定） | sync 後に triage →（続けて）auto-process |
| `receive.auto_triage: false` | **手動** `mail intake triage` + `scheduling auto-process` が必要（doctor WARNING） |
| `receive.auto_schedule_coordination: false` | triage 後も日程自動取込なし |

Google Calendar / Meet: `GOOGLE_CALENDAR_ID` + `GOOGLE_CALENDAR_ACCESS_TOKEN`。未設定時はローカル `calendar.yaml` のみで close 可（doctor WARNING）。

---

## 4. dev/test リハーサル

```bash
orgos doctor --tenant <id> --repair
orgos executive scheduling rehearsal --full --tenant <id>
# または
./scripts/scheduling-live-smoke.sh sch-verify
```

- 返信経路: EML 注入 → `process-mail`（`respond` ショートカットは使用しない）
- SMTP: `smtp.test.local`（EML 出力のみ · 認証不要）

---

## 5. トラブルシュート

| 症状 | 対処 |
|------|------|
| `unknown command 'approve-send'` | 最新 CLI · `orgos executive scheduling approve-send --help` |
| `Invalid operator key` | `orgos doctor --tenant <id> --repair` |
| `Mail setup incomplete` / SMTP ERROR | `company.yaml` のメール · `ORGOS_SMTP_USER` / `ORGOS_SMTP_PASSWORD` |
| 承認したがメールが飛ばない | Chat は `send: true` が必要 · または CLI `approve-send` |
| sync しても案件が進まない | `auto_triage: false` → 手動 triage + `auto-process` |
| `No pending CEO question` | 全参加者 accept 後 `process --all` / `advance` |
| Vitest `fixture restore lock` | `rm -rf tests/.fixture-restore.lock` または `orgos doctor --repair` |
| Google Meet なし | トークン未設定 — ローカル確定は可能 · setup は `docs/executive/google-calendar-setup.md` |

---

## 6. 検証チェックリスト

```bash
orgos doctor --tenant <id> --repair          # mail · operator ERROR 0（WARNING 可）
npm run test:scheduling
./scripts/scheduling-live-smoke.sh <id>      # rehearsal + validate
# 実 SMTP（opt-in）:
# SCHEDULING_LIVE_SMTP=1 ./scripts/scheduling-live-smoke.sh mal
orgos validate --tenant <id>
```

---

## 7. 段階導入（実用ロードマップ）

| Phase | 状態 | 内容 |
|-------|------|------|
| **A 送信** | 実装済 | CLI `approve-send` · Chat `send` · dry-run 既定 |
| **B 受信** | 運用 | IMAP sync + triage/auto-process · `auto_triage` 方針 |
| **C CEO** | 運用 | Chat answer · CLI `mail intake ceo answer` フォールバック |
| **D Calendar** | 任意 | Google/Meet トークン接続 |
| **E 硬化** | 任意 | poller 常駐 · `scheduling-live-smoke.sh` |

**まだ別検証が必要なもの:** IMAP/SMTP のテナント固有ライブ往復 · Steward Chat session（passkey）本番 · Google OAuth refresh 自動化。
