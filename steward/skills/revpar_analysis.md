# Skill: revpar_analysis（RevPAR 分析）

## 目的

PROP-002 亀沢の RevPAR（ADR × 稼働率）を分析し、収益改善材料を返す。

## 入力

- `cursor/data/properties/PROP-002.yaml`（hotel.* · operating_costs）
- `docs/operations/lodging/templates/operations/予約稼働台帳.csv`（実績）
- OTA データ（手入力）

## 出力

- RevPAR 週次/月次
- ADR vs 稼働率トレードオフ
- `docs/reports/agent-summaries/prop-002/revpar-{YYYY-MM-DD}.md`

## 使用 Agent

Hospitality Agent · Finance Agent（Read）

## 保存先

`docs/reports/agent-summaries/prop-002/`

## CLI

```bash
npm run steward -- properties show PROP-002
npm run steward -- analyze property PROP-002
```

## 禁止

- secrets の転記
- 稼働率目標の独断変更（Executive 判断）
