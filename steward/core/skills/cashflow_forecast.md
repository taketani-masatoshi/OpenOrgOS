# Skill: cashflow_forecast（キャッシュフロー予測）

**Path:** `steward/core/skills/cashflow_forecast.md`
**Runtime:** `cli`

## 目的

現預金・借入返済を踏まえ **月次 CF サマリ**（3行集計）とランウェイを試算する。

> **詳細資金繰り表**（日次/週次 · 口座別 · AR/AP · 支払カレンダー）は JP テナントでは **`jp_bank_corporate`** モジュール · `orgos jp bank cashflow generate` に委譲。

## 入力

- `data/finance/cash-balance.yaml`（dashboard ランウェイ用）
- `data/finance/loans.yaml`
- `data/finance/monthly/{YYYY-MM}.yaml`（実績）
- `data/plans/property-revenue.yaml` · `data/finance/fixed-costs.yaml`（計画月）

## 出力

- CF 試算 MD（12 ヶ月 · コンソール or `docs/reports/forecast/`）
- ランウェイ · アラート → `orgos dashboard`
- 詳細表 → `docs/finance/treasury/cashflow-schedule/`（**jp bank CLI**）
- JP 詳細表の意思決定値 → `shortfall_date` と `required_funding_amount` / `required_funding_by_date`

## 使用 Agent

Finance Agent（Executive Steward は要約のみ Read）· 詳細生成は **Accounting / jp_bank_corporate**

## 保存先

| 種別 | パス |
|------|------|
| 詳細 | `docs/plans/cashflow-detail.md` |
| 要約 | `docs/reports/agent-summaries/finance/` |

## CLI

```bash
npm run orgos -- forecast
npm run orgos -- scenario
npm run orgos -- jp bank cashflow generate --granularity weekly --horizon 13w
```

JP 支払日程の正本は `data/finance/payment-calendar.yaml`。Chat からの validate 確認は `operator_validate_status`（`chat:read`、L1-safe）。

## 禁止

- 返済実行の自動決定
- cash-balance 未確認数値の invent
