# Skill: analytics_kpi_scorecard

## 目的

KPI スコアカード — 目標 vs 実績 vs 閾値（RAG）

## 入力

- `data/analytics/metrics.yaml` — 指標定義
- `data/analytics/kpi-targets.yaml` — FY 目標
- 各 Agent SoT — resolver 経由（実測値はコピーしない）

## 出力

- stdout Markdown / `--json`
- pulse: `docs/reports/agent-summaries/data-analytics/{YYYY-MM-DD}-{topic}.md`

## 使用 Agent

Data Analytics Agent

## CLI

```bash
orgos analytics kpi
orgos analytics kpi --json
orgos skills run analytics-kpi
```

## runtime

cli

## 禁止

- L2 実測値を metrics.yaml に転記
- finance / hr 正データの改変
