# Skill: revpar_analysis（RevPAR 分析）

**モジュール:** hospitality

## 目的

宿泊モジュール対象物件（例: PROP-002 緑丘ゲストハウス）の RevPAR（ADR × 稼働率）を分析する。

## 入力

- `modules.yaml` · `data/properties/PROP-*.yaml`（hotel.* · operating_costs）
- `docs_root` 配下の稼働台帳 CSV

## 出力

- `docs/reports/{summary_dir}/revpar-{YYYY-MM-DD}.md`

## 使用 Agent

Hospitality Module Agent · Finance Agent（Read）

## 禁止

- secrets の転記
