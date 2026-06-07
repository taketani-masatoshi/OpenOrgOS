# Skill: noi_analysis（NOI 分析）

**モジュール:** rental

## 目的

賃貸モジュール対象物件（例: PROP-001 みなとビル501）の NOI（純営業収益）を試算し、改善 levers を提示する。

## 入力

- `modules.yaml` の `property_ids` · `data/properties/PROP-*.yaml`（rental.*）
- `data/plans/property-revenue.yaml` · `data/plans/expense-plan.yaml`

## 出力

- `docs/reports/{summary_dir}/noi-{YYYY-MM-DD}.md`

## 使用 Agent

Rental Module Agent · Finance Agent（Read）

## CLI

```bash
npm run steward -- properties show PROP-001
npm run steward -- analyze property PROP-001
```

## 禁止

- 他モジュール物件データの混在
