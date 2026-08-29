# Skill: analytics_data_quality

## 目的

データ品質 — スキーマ · 整合性 · 契約台帳 · HR 等の健全性スコア

## 入力

テナント data/ 全体（`computeDataHealth`）

## 出力

stdout Markdown / `--json`

## 使用 Agent

Data Analytics Agent

## CLI

```bash
orgos analytics quality
orgos analytics quality --json
orgos skills run analytics-quality
```

## runtime

cli

## 禁止

- L2 値のチャット出力
