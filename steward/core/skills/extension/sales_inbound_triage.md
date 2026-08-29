# Skill: sales_inbound_triage

**Path:** `steward/core/skills/extension/sales_inbound_triage.md`  
**runtime:** `cli` · **Agent:** Sales Inbound

## 目的

`data/sales/inbound/inquiries.yaml` を読み、問合せ件数 · 未対応 · 初動 SLA · 期限アラートを **決定論** で集計する（L1 のみ）。

## 入力 SoT

| パス | 内容 |
|------|------|
| `data/sales/inbound/inquiries.yaml` | 問合せキュー（`INQ-YYYY-NNN`） |
| `data/sales/pipeline.yaml` | qualified 後の商談連携チェック（任意） |

## 判定基準

- **未対応:** `status` が `new` または `triaged`
- **初動 SLA 超過:** `status: new` かつ `received_on` から `--stale-days`（既定 3 日）経過
- **期限アラート:** `next_action_due` が超過または `--days`（既定 7 日）以内
- **demo 除外:** 既定で `demo: true` を集計から除外

## 出力

- stdout: Markdown サマリ
- `--output`: `docs/reports/agent-summaries/sales-inbound/{YYYY-MM-DD}-inbound.md`

## CLI

```bash
npm run orgos -- skills run sales-inbound
npm run orgos -- skills run sales-inbound --output inbound-$(date +%F).md
npm run orgos -- sales inbound --json
npm run orgos -- sales inbound intake --dry-run
```

## 禁止

- 差出人メール · 電話 · メール本文の出力（L2/L3）
- 送信 · 承認の実行
- `inquiries.yaml` の自動更新（intake は `orgos sales inbound intake` を使用）
