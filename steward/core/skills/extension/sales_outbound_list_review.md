# Skill: sales_outbound_list_review

**Path:** `steward/core/skills/extension/sales_outbound_list_review.md`  
**runtime:** `cli` · **Agent:** Sales Outbound

## 目的

`data/sales/outbound/campaigns.yaml` を読み、施策件数 · active 数 · 接触カバレッジ · 期限アラートを **決定論** で集計する（L1 のみ）。

## 入力 SoT

| パス | 内容 |
|------|------|
| `data/sales/outbound/campaigns.yaml` | アウトバウンド施策（`OUT-YYYY-NNN`） |

## 判定基準

- **active:** `status: active`
- **接触カバレッジ:** active 施策の `contacted_count / target_count` 合算（`target_count` 未設定は集計から除外し注記）
- **接触率低:** `active` かつ接触率が 30% 未満（閾値は view 実装正本）
- **期限アラート:** `next_action_due` が超過または `--days`（既定 7 日）以内
- **draft due 未設定:** `status: draft` かつ `next_action_due` 未設定（`draft_no_due`）
- **demo 除外:** 既定で `demo: true` を集計から除外

## 出力

- stdout: Markdown サマリ
- `--output`: `docs/reports/agent-summaries/sales-outbound/{YYYY-MM-DD}-outbound.md`

## CLI

```bash
npm run orgos -- skills run sales-outbound
npm run orgos -- skills run sales-outbound --output outbound-$(date +%F).md
npm run orgos -- sales outbound --json
npm run orgos -- sales outbound-view --json
```

## 禁止

- リスト連絡先 · メール本文の出力（L2/L3）
- 送信 · 承認の実行
- 文案下書き（`sales_outreach_draft` · runtime: agent を使用）
