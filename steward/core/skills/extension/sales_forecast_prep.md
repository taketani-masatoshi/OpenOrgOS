# Skill: sales_forecast_prep

**runtime:** `cli` · **Agent:** Sales Lead

## 目的

対象月に `close_date_target` があるオープン商談の加重受注予測。

## 入力

| Path | 内容 |
|------|------|
| `data/sales/pipeline.yaml` | 商談正本 |

## 出力

`docs/reports/agent-summaries/sales-lead/{YYYY-MM-DD}-forecast.md`（`--output` 指定時）

## CLI

```bash
# 当月予測
npm run orgos -- skills run sales-forecast

# 指定月
npm run orgos -- skills run sales-forecast --month 2026-08 --output 2026-08-forecast.md

# 同等コマンド
npm run orgos -- sales forecast --month 2026-08
```

## 禁止

- 担当者メール · 電話の出力（L2）
- 受注/失注の最終決定
