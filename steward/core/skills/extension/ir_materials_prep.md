# Skill: ir_materials_prep

## 目的

決算説明会 · fact sheet · 株主向けレターの **下書き** を準備する。数値は finance 正本から引用し、外部配布前は人間承認必須。

## 使用 Agent

Investor Relations Agent

## 入力

- `data/investor-relations/ir-materials.yaml` — 資料索引
- `data/finance/` — 数値（Read · finance 委譲）
- `docs/investor-relations/` — 下書き MD

## 出力

`docs/reports/agent-summaries/investor-relations/{YYYY-MM-DD}-materials.md`

## CLI（補助）

```bash
npm run orgos -- operations ir briefing
npm run orgos -- operations ir validate
```

## 禁止

- 未公開数値 · L2 連絡先の外部下書きへの転記
- 人間承認なしの公開指示
