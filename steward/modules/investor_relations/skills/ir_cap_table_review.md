# Skill: ir_cap_table_review

## 目的

`data/investor-relations/cap-table.yaml` の希薄化後比率合計 · 重複 holder を決定論検証する。

## 入力

- `data/investor-relations/cap-table.yaml`

## 出力

`docs/reports/agent-summaries/investor-relations/{YYYY-MM-DD}-cap-table.md`（`-o` 指定時）

## CLI

```bash
npm run orgos -- operations ir cap-table-review
npm run orgos -- skills run ir_cap_table_review
```
