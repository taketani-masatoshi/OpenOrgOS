# Sales CRM runbook（14機能 · CLI 再現）

**版:** 1.0 · **日付:** 2026-08-28  
**テナント例:** `ORGOS_TENANT=mal`  
**関連:** [sales-pipeline-spec.md](sales-pipeline-spec.md) · [sales-inbound-spec.md](sales-inbound-spec.md) · [ADR 0062](../adr/0062-sales-crm-lifecycle.md)

プレフィックス:

```bash
export ORGOS_TENANT=mal
alias orgos='npm run orgos --'
```

| # | 機能 | CLI 再現 | Console |
|---|------|----------|---------|
| 1 | 顧客・担当・商談 SoT | `orgos sales migrate-accounts --dry-run` · `orgos sales deal create …` · `orgos sales deal update DEAL-… --title "…"` | 一覧 + pipeline 編集 |
| 2 | Gmail / mail 紐付け | `orgos sales mail-link` · `orgos sales mail-link-resolve --triage-id … --deal DEAL-…` | ambiguous 件数 + CLI 案内 |
| 3 | パイプライン遷移 | `orgos sales deal set-stage DEAL-… --stage qualify` · lost 時 `--lost-reason price` | POST set-stage |
| 4 | リード分類 | `orgos sales classify` · `orgos sales classify --apply` | CLI-only |
| 5 | メール下書き・FU | `orgos sales draft create …` · `orgos sales follow-up-from-sent DEAL-… --confirm` | CLI-only（送信は Secretary） |
| 6 | デモ日程 | `orgos sales demo open --deal DEAL-…`（confirmed 時 next_action 自動更新） | CLI-only |
| 7 | 見積・受注引渡し | `orgos sales quote create …` · `orgos sales quote set-status QUOTE-… --status sent` · `orgos sales handoff-won DEAL-…` | CLI-only（CTR は手動） |
| 8 | 次アクション | `orgos sales deal set-next-action DEAL-… --action "…" --due YYYY-MM-DD` | POST set-next-action |
| 9 | 失注理由 | `orgos sales deal set-stage DEAL-… --stage lost --lost-reason timing` | pipeline select |
| 10 | 売上予測 | `orgos sales forecast --month YYYY-MM` | 読取（CLI） |
| 11 | ダッシュボード | `orgos sales crm-dashboard` · `orgos sales summary` | GET crm / pipeline サマリ |
| 12 | 重複防止 | `orgos validate`（dedupe）· `orgos sales account merge --from CUST-… --into CUST-…` | WARNING + CLI 案内 |
| 13 | 自動 vs 人間 | won/reopen は `chat:approve` · merge は approve · promote は明示コマンドのみ | 権限ゲート |
| 14 | 監査 | `data/audit/audit.jsonl` の `sales_*` / `detail`（L2 値なし） | — |

## 境界（守ること）

- 自動送信しない · 自動 CTR を作らない · `qualified` → DEAL の暗黙起票をしない（`inquiry-promote` / Console 商談化のみ）
- Chat / Console L1 に contact `email` / `phone` を出さない

## 監査 detail 規約

| 操作 | event（代表） | detail |
|------|---------------|--------|
| deal create/update | `sales_stage_change` | `deal_created` / `deal_updated` |
| stage / next_action | `sales_stage_change` | ステージ遷移 · follow_up_from:DRAFT-… |
| inquiry status | `sales_stage_change` | `inquiry:from→to` |
| mail link | `sales_mail_link` | `deal:…` / `inquiry:…` |
| merge | `sales_dedupe_merge` | `merged_from:CUST-…` |
| handoff / promote | `sales_handoff` | `account:…` / `promoted:DEAL-…` |
| quote | `sales_quote` | `created:…` / `status:…` |
| demo confirm | `sales_demo` | `confirmed:DEAL-…` |
