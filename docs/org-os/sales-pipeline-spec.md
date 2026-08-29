# 営業パイプライン & アウトバウンド（sales-pipeline / sales-outbound）

**版:** 1.1 · **日付:** 2026-08-28  
**状態:** 実装済み（Wave 2 · 書込み CLI / Console）  
**関連 ADR:** [0047 Sales Line Deterministic Stack](../adr/0047-sales-line-deterministic-stack.md) · [0062 Sales CRM Lifecycle](../adr/0062-sales-crm-lifecycle.md)

## 目的

商談パイプライン（sales_lead）とアウトバウンド施策（sales_outbound）を YAML SoT から CEO 向け L1 KPI として決定論提供する。送信 · 契約確約は人間（Secretary / 承認者）。

---

## データ正本

| パス | Agent | 内容 | 層 |
|------|-------|------|-----|
| `data/sales/pipeline.yaml` | sales_lead | 商談パイプライン | L1 |
| `data/sales/outbound/campaigns.yaml` | sales_outbound | アウトバウンド施策 | L1 |
| `docs/sales/` | — | 運用メモ | L1 |

スキーマ: `schemas/sales.ts`  
ドメイン: `src/lib/sales-pipeline-view.ts` · `src/lib/sales-outbound-view.ts`

---

## 商談パイプライン（sales_lead）

### ステージ

```
lead → qualify → proposal → negotiation → won | lost
```

| stage | 意味 |
|-------|------|
| `lead` | 初回接触 · 情報収集 |
| `qualify` | 適合性確認 |
| `proposal` | 提案中 |
| `negotiation` | 条件交渉 |
| `won` / `lost` | 終端 |

### 指標

- オープン商談数 · ステージ別件数
- 加重パイプライン（`amount_man × probability_pct`）
- アラート: `next_action_due` 超過/間近 · ステージ停滞

### CLI

| コマンド | 用途 |
|----------|------|
| `orgos sales summary` | L1 サマリ |
| `orgos sales forecast` | 受注予測 |
| `orgos sales pipeline-view` | Canvas ViewModel |
| `orgos skills run sales-pipeline` | Skill CLI |
| `orgos skills run sales-forecast` | 予測 Skill |
| `orgos sales deal create\|update\|set-stage\|set-next-action` | 商談 CRUD（人間 / CLI · Console POST 同一関数） |
| `orgos sales migrate-accounts` | party → CUST/CONTACT 移行 |
| `orgos sales classify` | リード分類（`--apply` で SoT 反映） |
| `orgos sales mail-link` · `mail-link-resolve` | Gmail / triage スレッド紐付け |
| `orgos sales follow-up-from-sent --confirm` | 送信済み draft → next_action=フォローアップ |
| `orgos sales account merge --from --into` | CUST マージ（CLI のみ · `chat:approve`） |
| `orgos sales handoff-won` | 受注 → CS 顧客昇格（CTR 自動作成なし） |
| `orgos sales quote create\|set-status` | 見積 SoT |
| `orgos sales demo open` | デモ日程（SCH · `sales_demo` confirmed 時に DEAL next_action 更新） |
| `orgos sales crm-dashboard` | 拡張 KPI（ambiguous mail · dedupe） |

---

## アウトバウンド施策（sales_outbound）

### ステータス

| status | 意味 |
|--------|------|
| `draft` | 下書き · 未着手 |
| `active` | 実行中 |
| `paused` | 一時停止 |
| `completed` | 完了 |

### 指標

- 施策総数 / `active` 件数
- 接触カバレッジ = `contacted_count / target_count`（**active 施策のみ**合算 · `target_count` 未設定は除外し注記）
- アラート:
  - `next_action_due` 期限超過 · 期限間近
  - `draft` かつ `next_action_due` 未設定（`draft_no_due`）
  - `active` で接触率が閾値（30%）未満

### CLI

| コマンド | 用途 |
|----------|------|
| `orgos sales outbound` | L1 サマリ（件数 · 接触率 · アラート） |
| `orgos sales outbound --json` | View JSON |
| `orgos sales outbound-view` | Canvas ViewModel |
| `orgos skills run sales-outbound` | Skill CLI（要約 MD 出力可） |

---

## Chat / Today

| 領域 | Fact provider | Today |
|------|---------------|-------|
| パイプライン | `operator_sales_pipeline` | `formatSalesPipelineTodayLines()` |
| アウトバウンド | `operator_sales_outbound` | `formatSalesOutboundTodayLines()` |

dashboard KPI: `sales_pipeline` · `sales_outbound`

---

## demo 除外

`demo: true` の商談/施策は既定集計除外。`--include-demo` で含める。

---

## 禁止 · L2 方針

- `party.contact_email` / `contact_phone` · リスト連絡先 · メール本文を Chat / tracked MD に出力しない
- 送信実行 · 契約条件の単独確約
- 文案下書きは `sales_outreach_draft`（runtime: agent）へ委譲

---

## 関連 Agent

| Agent | 役割 |
|-------|------|
| sales_lead | パイプライン統括 · 商談登録 |
| sales_outbound | リスト精査 · 初回アプローチ下書き |
| sales_inbound | 問合せトリアージ（[sales-inbound-spec.md](sales-inbound-spec.md)） |
| customer_success | 既存顧客（[customer-success-spec.md](customer-success-spec.md)） |
| secretary | 送信実行 |

---

## Console（Wave 2b）

| 面 | 操作 |
|----|------|
| `/customers/pipeline/` | ステージ select（lost 時 `lost_reason` 必須）· next_action 短フォーム |
| `/customers/inbound/` | qualified「商談化」· ambiguous mail CLI 案内 |
| `/customers/outbound/` | 商談は「パイプラインで編集」リンクのみ（二重編集禁止） |
| `/customers/accounts/` | 一覧 · dedupe WARNING · merge は CLI のみ |

権限: オープン間ステージ / next_action / promote = `chat:ask` · won / reopen / merge = `chat:approve`。

### Console POST vs CLI-only

| 種別 | 経路 |
|------|------|
| Console POST | `set-stage` · `set-next-action` · `inquiry/promote` |
| CLI-only | `account merge` · `mail-link-resolve` · `follow-up-from-sent` · `handoff-won` · `deal create/update` · `quote*` · `demo open` · `classify --apply` · `inquiry-set-status` · `mail-link` · `draft*` |

14機能 CLI 再現: [sales-crm-runbook.md](sales-crm-runbook.md)

---

## 検証

```bash
ORGOS_TENANT=mal npm run orgos -- validate
ORGOS_TENANT=mal npm run orgos -- sales crm-dashboard
ORGOS_TENANT=mal npm run orgos -- sales outbound
ORGOS_TENANT=mal npm test -- tests/sales-*.test.ts tests/customers-api*.test.ts
npm run test:registry:check
```

Vitest は [vitest.config.ts](../../vitest.config.ts) で `fileParallelism: false`。並行 vitest 実行時は fixture restore lock 競合を避けるため `ORGOS_TEST_LOCK_TIMEOUT_MS` を必要に応じて引き上げる。
