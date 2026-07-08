# Skill: cashflow_forecast（キャッシュフロー予測）

## 目的

現預金・借入返済・税支払を踏まえ CF とランウェイを試算する。

## 入力

- `data/finance/cash-balance.yaml`
- `data/finance/loans.yaml`
- `data/plans/revenue-plan.yaml` · `expense-plan.yaml`
- `data/plans/investment-plan.yaml`

## 出力

- CF 試算 MD（13 ヶ月）
- ランウェイ・アラート
- `docs/reports/agent-summaries/finance/cashflow-{YYYY-MM-DD}.md`

## 使用 Agent

Finance Agent（Executive Steward は要約のみ Read）

## 保存先

| 種別 | パス |
|------|------|
| 詳細 | `docs/plans/cashflow-detail.md` |
| 要約 | `docs/reports/agent-summaries/finance/` |

## CLI

```bash
npm run orgos -- forecast
npm run orgos -- scenario
```

## 禁止

- 返済実行の自動決定
- cash-balance 未確認数値の invent
