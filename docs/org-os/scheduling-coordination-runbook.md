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

## 3. 本番フロー（概要）

```bash
# 1. 案件
orgos executive scheduling new --title "..." --participant "名前|email|external"
orgos executive scheduling propose --id SCH-YYYY-NNN

# 2. 提案送信（CEO 承認）
orgos executive scheduling approve-send --id SCH-YYYY-NNN --reviewed
# 実 SMTP: --no-dry-run（mail-config + ORGOS_SMTP_* 必須）

# 3. 返信（Mail Intake 後）
orgos executive scheduling process --all
# または auto-process（mail sync 連動）

# 4. CEO 最終確認 → Steward Chat / mail intake ceo answer

# 5. 確認
orgos executive scheduling show --id SCH-YYYY-NNN
orgos validate --tenant <id>
```

---

## 4. dev/test リハーサル

```bash
orgos doctor --tenant <id> --repair
orgos executive scheduling rehearsal --full --tenant <id>
```

- 返信経路: EML 注入 → `process-mail`（`respond` ショートカットは使用しない）
- SMTP: `smtp.test.local`（EML 出力のみ · 認証不要）

---

## 5. トラブルシュート

| 症状 | 対処 |
|------|------|
| `Invalid operator key` | `orgos doctor --tenant <id> --repair` |
| `Mail setup incomplete` | `company.yaml` に `representative_email` または `contact_email` · `doctor --repair` |
| `No pending CEO question` | 全参加者 accept 後 `advanceSchedulingWorkflow` — `process --all` または rehearsal 再実行 |
| Vitest `fixture restore lock` | `rm -rf tests/.fixture-restore.lock` または `orgos doctor --repair` |
| 提案 draft 未送信 | `approve-send --id SCH-* --reviewed` |

---

## 6. 検証チェックリスト（厳格 100 点）

```bash
orgos doctor --tenant <id> --repair          # mail · operator ERROR 0
npm run test:scheduling                      # scheduling 回帰（characterization 含む）
npm test                                     # 全 Vitest green
orgos executive scheduling rehearsal --full --tenant <id>
orgos validate --tenant <id>
```

---

## 7. スコープ外（別 Runbook）

- IMAP 本番 sync → `auto-process`
- Google Calendar / Meet OAuth 本番
- Steward Chat CEO 回答（session BFF）

---

## 8. 付録 — モジュール地図

**Path:** `src/lib/scheduling-coordination/`  
**CLI:** `src/commands/scheduling-coordination.ts`

### 依存方向（上→下は呼ばない）

```
入口 (CLI / chat-intent / process-mail / auto-process / reminder-poller)
  → 案件更新 (case-mutations / mail-reply / propose-case / ceo-confirm)
    → 状態機械 (next-action 純粋 · persist-next-action · workflow)
      → 永続 (store)
  → 副作用 (correspondence-drafts / delegated-send / calendar-write)
```

判定（`next-action`）は I/O しない。永続ヘルパと副作用は入口・案件更新側が呼ぶ。  
`lifecycle.ts` / `process-mail.ts` は外部互換の再公開ファサード。新規呼び出しは分割モジュールを直接 import する。

### 役割

| モジュール | 役割 |
|------------|------|
| `next-action` | status / next_action / exception_reason の純粋判定 |
| `persist-next-action` | 上記3フィールドに変化があるときだけ store 更新 |
| `workflow` | リマインド更新 → next-action 永続 → clarify 下書き / CEO 質問 |
| `store` | `scheduling-cases.yaml` の read / revision 付き write |
| `case-mutations` | new / cancel / reschedule / respond 等の CLI 向け更新 |
| `chat-parse` / `chat-intent` / `chat-draft-store` | Steward Chat の抽出・起票・下書き |
| `mail-match` / `mail-intake` / `mail-reply` | 照合 · 安全受付 · 返信反映（対案含む） |
| `process-mail` | メール入口オーケストレーション（ファサード再公開あり） |
| `correspondence-drafts` / `draft-text` / `delegated-send` | 下書き生成 · 文面 · 委任送信 |
| `ceo-confirm` / `ceo-choice` / `ceo-gates` | CEO ゲートと選択肢 |
| `calendar-write` | ローカル予定 → 任意 Google（失敗後再試行可） |
| `propose-case` / `slots` / `venue-*` | 候補生成 · 会場ゲート |
| `rehearsal*` / `operational-readiness` | リハーサルと doctor 連携 |

### 状態保存の差（統合しない）

| 関数 | 保存の比較 | 副作用 |
|------|------------|--------|
| `persistSchedulingNextAction` | status · next_action · exception_reason | なし |
| `advanceSchedulingWorkflow` | 同上（`updated_at` は注入 `now`） | その後 clarify / CEO 質問 |

### 既知の非対称（変更しない）

CLI の `proposeSchedulingCaseSlots` と lib の `proposeSlotsOntoSchedulingCase` は、CEO 受付検査と会食時間帯の扱いに差がある。重複ではなく既存仕様差。統合は別課題。
