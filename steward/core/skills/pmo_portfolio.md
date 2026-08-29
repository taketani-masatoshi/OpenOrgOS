# Skill: pmo_portfolio（案件ポートフォリオ L1 集計）

## 目的

`data/projects/` から案件数・RAG・期限超過マイルストーンを決定論的に集計する（金額・個人名は出力しない）。

## 入力

- `data/projects/portfolio.yaml`
- `data/projects/PRJ-*.yaml`

## 出力

- 件数 · RAG · status 内訳 · 期限超過数
- JSON オプションあり

## 使用 Agent

Project Management Agent · COO / Executive Steward（決定論チャット経路）

## 保存先

読み取りのみ — 書き込みなし。

## CLI

```bash
npm run orgos -- pmo portfolio
npm run orgos -- pmo portfolio --json
npm run orgos -- skills run pmo-portfolio
```

## runtime

`cli` — LLM 不要。

## 禁止

- 金額 · 個人名 · 口座の出力
- モジュール YAML / 契約本文の複製
