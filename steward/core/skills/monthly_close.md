# Skill: monthly_close（月次決算）

**Path:** `steward/core/skills/monthly_close.md`
**Runtime:** `cli`

## 目的

指定月の収支を締め、月次 YAML と要約 MD を更新する。

## 入力

- `data/finance/monthly/{YYYY-MM}.yaml`
- `data/finance/fixed-assets.yaml`（減価償却整理仕訳）
- `data/finance/chart-of-accounts.yaml`（科目マッピング）
- 領収書・経費データ（`docs/finance/accounting/`）
- 物件 Agent からの収益前提（賃貸 · 宿泊モジュール）

## 出力

- 更新済 `finances/monthly/{YYYY-MM}.yaml`
- `docs/reports/agent-summaries/finance/{YYYY-MM}-close.md`
- （任意）`docs/reports/monthly/` 連携

## 使用 Agent

Finance Agent

## 保存先

| 種別 | パス |
|------|------|
| 正データ | `data/finance/monthly/` |
| 要約 | `docs/reports/agent-summaries/finance/` |

## CLI

```bash
npm run orgos -- finances close --month YYYY-MM -o YYYY-MM-close.md
npm run orgos -- ledger trial-balance --as-of YYYY-MM-28
npm run orgos -- ledger monthly-reconcile --month YYYY-MM
npm run orgos -- deps check --file data/finance/monthly/YYYY-MM.yaml
npm run validate
npm run orgos -- jp bank cashflow generate --granularity weekly --write
```

## JP 資金繰り（月次締め後）

Accounting Agent と連携し `jp_bank_corporate` で詳細表を生成:

```bash
npm run orgos -- jp bank calendar validate
npm run orgos -- jp bank cashflow generate --granularity weekly --write
npm run orgos -- validate
```

支払日程の正本は `data/finance/payment-calendar.yaml`。出力要約には `required_funding_amount` / `required_funding_by_date` を含める。Chat では `operator_validate_status`（`chat:read`）で validate 状態を確認できる。

Path: `steward/jurisdiction-packs/JP/modules/jp_bank_corporate/skills/jp_cashflow_schedule.md`

## 禁止

- 契約条項の変更
- 経営判断（投資優先度等）
