# Skill: cs_nps_analysis

## 目的

NPS スコアを決定論集計（promoter/passive/detractor · NPS 値）。

## 入力 SoT

- `data/customers/nps.yaml`（コメント禁止 · スコアのみ）

## CLI

```bash
orgos skills run cs-nps-analysis
orgos operations customer-success nps
```

## 出力

`docs/reports/agent-summaries/customer-success/{YYYY-MM-DD}-nps.md`

## 禁止

- NPS 自由記述コメントの SoT 化 · 出力
