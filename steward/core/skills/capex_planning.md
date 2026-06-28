# Skill: capex_planning（CAPEX 計画）

## 目的

投資計画 YAML を更新し、CF ・ 償却への影響を試算する。

## 入力

- `data/plans/investment-plan.yaml`
- 工事見積 · 物件 CAPEX 計画 MD
- モジュール対象 `data/properties/PROP-*.yaml`（宿泊 CAPEX 等）

## 出力

- 更新済 `investment-plan.yaml`
- CAPEX スケジュール MD
- `docs/reports/agent-summaries/finance/capex-{YYYY-MM-DD}.md`

## 使用 Agent

Finance Agent · Hospitality Agent（宿泊モジュール CAPEX 入力）

## 保存先

| 種別 | パス |
|------|------|
| 正データ | `data/plans/investment-plan.yaml` |
| 要約 | `docs/reports/agent-summaries/finance/` |

## CLI

```bash
npm run orgos -- deps check --file data/plans/investment-plan.yaml
npm run validate
npm run orgos -- sync all
```

## 禁止

- 投資実行の自動承認
- 役員貸付条件の変更
