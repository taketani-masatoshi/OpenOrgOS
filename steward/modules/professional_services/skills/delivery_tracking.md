# Skill: delivery_tracking（案件・納品追跡）

**モジュール:** professional_services

## 目的

受託・サービス案件の進捗 · 工数 · 納品ステータスを整理し、Finance への収益認識材料を返す。

## 入力

- `modules.yaml` の `data_root/` 配下 YAML（将来）
- `data/contracts/CTR-*.yaml`（type: service · outsourcing）
- `data/plans/revenue-plan.yaml`（サービス行）

## 出力

- 案件ステータス表
- `docs/reports/{summary_dir}/delivery-{YYYY-MM-DD}.md`

## 使用 Agent

Professional Services Module Agent · Contract Agent（Read）· Finance Agent（Read）

## 禁止

- 契約 executed 化の独断（Contract 主導）
