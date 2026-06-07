# Skill: noi_analysis（NOI 分析）

## 目的

PROP-001 番町の NOI（純営業収益）を試算し、改善 levers を提示する。

## 入力

- `data/properties/PROP-001.yaml`（rental.*）
- `data/plans/property-revenue.yaml`（番町行）
- `data/plans/expense-plan.yaml`（番町費用）

## 出力

- NOI 試算表
- 空室・賃料・費用の感度
- `docs/reports/agent-summaries/prop-001/noi-{YYYY-MM-DD}.md`

## 使用 Agent

Property Rental Agent · Finance Agent（Read）

## 保存先

`docs/reports/agent-summaries/prop-001/`

## CLI

```bash
npm run steward -- properties show PROP-001
npm run steward -- analyze property PROP-001
```

## 禁止

- PROP-002 データの混在
- 全社 P/L の独断更新
