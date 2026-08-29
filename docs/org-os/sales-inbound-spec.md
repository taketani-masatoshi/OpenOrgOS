# インバウンド問合せ（sales-inbound）

**版:** 1.1 · **日付:** 2026-08-28  
**状態:** 実装済み（Wave 2b · promote / mail-link / Console 商談化）  
**関連 ADR:** [0047 Sales Line Deterministic Stack](../adr/0047-sales-line-deterministic-stack.md) · [0049 Inbound Inquiry Intake](../adr/0049-inbound-inquiry-intake.md) · [0062 Sales CRM Lifecycle](../adr/0062-sales-crm-lifecycle.md)

## 目的

Web 問い合わせ · メール · 紹介 · 提携提案を `data/sales/inbound/inquiries.yaml` でトリアージし、CEO 向け L1 KPI と Sales Inbound Agent の一次整理を決定論で提供する。送信 · 契約確約は人間（Secretary / 承認者）。

## データ正本

| パス | 内容 | 層 |
|------|------|-----|
| `data/sales/inbound/inquiries.yaml` | 問合せキュー | L1 |
| `docs/sales/inbound/` | 運用メモ · 下書き | L1 |
| `data/correspondence/mail-triage-queue.yaml` · `data/executive/mail-triage-queue.yaml` | メール分類（intake 前） | L1 |
| `records/executive/mail-received/*.eml` | 原文（Zone C · @file のみ） | L2 |

スキーマ: `schemas/sales.ts`（`salesInquirySchema`）  
ドメイン: `src/lib/sales-inbound-view.ts` · `src/lib/sales-inbound-intake.ts` · `src/lib/sales-inquiry-stage.ts` · `src/lib/sales-mail-link.ts` · `src/lib/sales-handoff.ts`

## 状態機械

```
new → triaged → responded → qualified → closed
                         ↘ closed
```

| status | 意味 |
|--------|------|
| `new` | 受付直後 · 未トリアージ |
| `triaged` | 優先度 · 担当割当済み |
| `responded` | 初回回答済み（送信は人間） |
| `qualified` | 商談化候補 — 人間が `inquiry-promote` / Console「商談化」 |
| `closed` | 終了（不適合 · 失注 · スパム · 商談化済み） |

合法遷移のみ `orgos sales inquiry-set-status` で更新。

## 初動 SLA · アラート

| 種別 | 条件 |
|------|------|
| 初動 SLA 超過 | `status: new` かつ `received_on` から 3 日超（CLI `--stale-days` で変更可） |
| 期限超過 | `next_action_due` < 基準日 |
| 期限間近 | `next_action_due` が 7 日以内（CLI `--days` で変更可） |
| qualified 取りこぼし | `qualified` だが未 promote |

## メール intake

1. Mail Intake が `classifyMail()` で `routing: sales_inbound` を付与（`inquiry` キーワード · `routing.inquiry_ham`）
2. `orgos sales inbound intake` が triage エントリを `INQ-YYYY-NNN` で起票
3. 同一 `gmail_thread_id` の二重 INQ は **skip**（`sales-inbound-intake`）
4. triage は `handoff_status: handed_off` · `handoff_ref: INQ-...` に更新
5. **メール本文 · アドレスは inquiries.yaml に書かない** — `source_ref` / thread id のみ

## Wave 2b · mail-link / promote

| 操作 | CLI | Console |
|------|-----|---------|
| 曖昧でないスレッド自動紐付け | `orgos sales mail-link` | GET inbound / pipeline に ambiguous 件数 |
| 曖昧キュー確定 | `orgos sales mail-link-resolve --triage-id … --deal\|--inquiry …` | CLI 案内のみ（破壊的 UI なし） |
| qualified → DEAL | `orgos sales inquiry-promote --id INQ-…` | Inbound「商談化」→ `POST …/inquiry/promote` |
| 状態遷移 | `orgos sales inquiry-set-status` | （CLI 正本） |

自動: 送信 · CTR 作成 · `qualified→DEAL` の暗黙起票は **しない**。

CLI 再現手順（14機能）: [sales-crm-runbook.md](sales-crm-runbook.md)

## CLI

| コマンド | 用途 |
|----------|------|
| `orgos sales inbound` | L1 サマリ（件数 · SLA · アラート） |
| `orgos sales inbound --json` | View JSON |
| `orgos sales inbound-view` | Canvas ViewModel |
| `orgos sales inbound intake` | メール triage → inquiries 起票 |
| `orgos sales inbound intake --dry-run` | 起票プレビュー |
| `orgos sales inquiry-set-status` | 問合せ状態機械 |
| `orgos sales inquiry-promote` | qualified → DEAL（人間） |
| `orgos sales mail-link` | 一意ドメインの自動紐付け |
| `orgos sales mail-link-resolve` | 曖昧 triage を forceTarget で確定 |
| `orgos skills run sales-inbound` | Skill CLI（要約 MD 出力可） |

## Chat / Today

- Fact provider: `operator_sales_inbound`
- Today: `formatSalesInboundTodayLines()` — 問合せ件数 · 未対応 · アラート
- dashboard: `sales_inbound` KPI タイル
- Console: `/customers/inbound/` — キュー · qualified 商談化 · ambiguous mail 案内

## 禁止 · L2 方針

- 差出人メール · 電話 · メール本文を Chat / tracked MD / Console L1 JSON に出力しない
- 契約条件の単独確約 · 送信実行
- `qualified` → `DEAL-*` は **明示 promote** のみ（自動起票しない）

## 関連 Agent

| Agent | 役割 |
|-------|------|
| `sales_inbound` | トリアージ · 初回回答下書き |
| `secretary` | 社外窓口 · 送信 |
| `sales_lead` | パイプライン · promote 後の商談運用 |
