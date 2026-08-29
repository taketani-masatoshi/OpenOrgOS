# Skill: hr_headcount（在籍人員 L1 集計）

## 目的

`data/hr/employees.yaml` から在籍人数・status / 職種内訳を決定論的に集計する（氏名は出力しない）。

## 入力

- `data/hr/employees.yaml`（正本）
- 任意突き合わせ: `data/org/org-chart.yaml` · `data/finance/payroll.yaml`

## 出力

- L1 人数サマリ（active / leave / inactive · 職種別）
- 被覆: `registered` | `unregistered` | `partial`
- JSON オプションあり

## 使用 Agent

Human Resources Agent · Secretary / Executive Steward（決定論チャット経路）

## 保存先

読み取りのみ — 書き込みなし。

## CLI

```bash
npm run orgos -- hr headcount
npm run orgos -- hr headcount --json
npm run orgos -- skills run hr-headcount
```

## runtime

`cli` — LLM 不要。

## 禁止

- 氏名 · 個人住所 · 給与明細の出力（L2）
- employees.yaml の推測埋め
