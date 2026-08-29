# Skill: sales_pipeline_review

**runtime:** `cli` · **Agent:** Sales Lead

## 目的

商談パイプラインの L1 集計（件数 · ステージ別 · 加重パイプライン · 期限超過/停滞アラート）。

## 入力

| Path | 内容 |
|------|------|
| `data/sales/pipeline.yaml` | 商談正本（schema: `schemas/sales.ts`） |

## 出力

`docs/reports/agent-summaries/sales-lead/{YYYY-MM-DD}-pipeline.md`（`--output` 指定時）

## CLI

```bash
# 標準出力
npm run orgos -- skills run sales-pipeline

# 要約 MD 書き込み
npm run orgos -- skills run sales-pipeline --output 2026-07-14-pipeline.md

# 同等コマンド
npm run orgos -- sales summary
```

## 禁止

- 担当者メール · 電話の出力（L2）
- 値引き最終決定 · 契約締結
