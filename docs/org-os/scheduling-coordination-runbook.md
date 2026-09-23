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
**CLI:** `src/commands/scheduling-coordination.ts` · 表示は `scheduling-coordination-render.ts`（純粋）  
**境界テスト:** `tests/scheduling-architecture.test.ts`（R1–R5 · 許可リスト空が天井）

### 層

```
入口: cli.ts / steward-chat / operator-console / wire-console / tests/setup-tenant
  → bootstrap/registerDomainAdapters()（idempotent · fail-closed）
殻: case-command · mail-reply · workflow · delegated-send · calendar-write · correspondence-adapter
  → 核: next-action · transitions · reply-plan · reply-parse · slots · ceo-choice · draft-tag · venue-gate
殻 → store / correspondence（送信・下書き）/ venue-booking
```

correspondence は `domain-adapters` 登録口だけを知る。日程調整は correspondence を呼べるが、逆向きの静的 import はない（ADR 0078）。

### 核と殻

| 層 | 規則 |
|----|------|
| **核** | ファイル I/O・`node:fs`・`./store`・他ドメイン直 import・裸の `new Date()` なし。会場予約事実は `SchedulingJudgmentContext` 経由 |
| **殻** | `resolveNextAction` / `mutateSchedulingCase` / `planScheduleReply` の実行と副作用。`now` は入口で注入 |

### アダプタのフック

`onDraftApproved` · `onDraftSent` · `onCeoAnswer` · `caseRef` · `onFollowUpDue`（`scheduling_reminder_after_hours`）· `styleLintContext` · `handoffSection` / `handoffActions` · `onMailPoll`

### 時計

案件 ID 年（`nextSchedulingCaseId`）と返信の「9月1日」年推定は注入した `now` を使う。年またぎ規則自体は変えない。

### 境界テストが強制すること

| 規則 | 意味 |
|------|------|
| R1 | correspondence → scheduling-coordination import = 0 |
| R2 | scheduling / correspondence→scheduling の動的 import = 0 |
| R3 | 再公開のみのファサード = 0 |
| R4 | 核モジュールの I/O・`new Date()` 違反は許可リストのみ（縮退） |
| R5 | 入口が `registerDomainAdapters()` を呼ぶ |

### 役割（抜粋）

| モジュール | 役割 |
|------------|------|
| `next-action` + `judgment-context` | 純粋判定 / 殻の resolve |
| `transitions` + `case-command` | 純粋遷移 / find→fail→save |
| `reply-plan` + `mail-reply` | 返信計画 / 保存と副作用 |
| `workflow` | リマインド更新 → next-action → clarify / CEO 質問 |
| `correspondence-adapter` + `draft-tag` | correspondence 向け実装 · タグ解析一本 |
| `draft-text-*` / `clarify-text` | 種別ごとの文面 |
| `propose-case` | CLI propose もここ（intake · 会食夜帯 · 下書き作り直し） |

### 状態保存の差

| 関数 | 保存の比較 | 副作用 |
|------|------------|--------|
| `persistSchedulingNextAction` | status · next_action · exception_reason | なし |
| `advanceSchedulingWorkflow` | 同上（`updated_at` は注入 `now`） | その後 clarify / CEO 質問 |
