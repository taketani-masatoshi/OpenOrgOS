# Skill: noi_analysis（CLI 実行）

**Path:** `steward/core/skills/noi_analysis.md`
**Runtime:** `cli`

## 目的

物件別 NOI（純営業収益）= 賃料・宿泊収入 − 運営費（減価償却除く）を `data/properties/` と `data/finance/monthly/` から決定論算出する。

## 入力

- `data/properties/*.yaml`
- `data/plans/property-revenue-plan.yaml`（計画 NOI）
- `data/finance/monthly/{YYYY-MM}.yaml`（実績）

## 出力

- 物件別計画 vs 実績サマリ（L1 · 口座番号・個人住所なし）
- 任意: `docs/reports/agent-summaries/finance/{YYYY-MM-DD}-noi.md`

## 使用 Agent

Finance Agent（Read/協調）

## CLI

```bash
npm run orgos -- analyze property [--id PROP-001] [--period FY2026]
npm run orgos -- skills run noi-analysis [--output noi-report.md]
npm run orgos -- validate
```

## 禁止

- L2 口座・個人連絡先の出力
- 税務申告判断の代替
