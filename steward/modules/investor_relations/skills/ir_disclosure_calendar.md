# Skill: ir_disclosure_calendar

## 目的

開示カレンダーから指定期間内の予定項目を一覧する。

## 入力

- `data/investor-relations/disclosure-calendar.yaml`

## 出力

`docs/reports/agent-summaries/investor-relations/{YYYY-MM-DD}-disclosure.md`（`-o` 指定時）

## CLI

```bash
npm run orgos -- operations ir disclosure-calendar --days 90
npm run orgos -- skills run ir_disclosure_calendar
```
