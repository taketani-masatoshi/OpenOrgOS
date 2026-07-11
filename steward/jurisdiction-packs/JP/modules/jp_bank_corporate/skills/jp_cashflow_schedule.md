# Skill: JP 資金繰り表生成

**Path:** `steward/jurisdiction-packs/JP/modules/jp_bank_corporate/skills/jp_cashflow_schedule.md`
**Runtime:** `cli` · **Agent:** Finance / Treasury

## 目的

日次 / 週次 / 月次の **資金繰り表** を決定論生成し、`docs/finance/treasury/cashflow-schedule/` に出力する。

## 入力

- `data/finance/cash-balance.yaml`（期首残高）
- `data/finance/payment-calendar.yaml`
- `data/finance/ar-ap-ledger.yaml`
- `data/finance/monthly/` · `data/plans/`（forecast 連動）

支払日程の正本は `data/finance/payment-calendar.yaml`。`orgos jp bank calendar import` は dry-run を確認し、採用時だけ `--write` する。

## CLI

```bash
orgos jp bank cashflow generate --granularity weekly --horizon 13w --write
orgos skills run jp-cashflow-schedule --write
orgos validate
```

Steward Chat では「日次90日の資金繰り表を出して」は preview、「月次3か月を保存して」は明示 write として扱う。

## 出力

- MD/CSV: `docs/finance/treasury/cashflow-schedule/{date}-{granularity}.{md|csv}`
- 要約: `docs/reports/agent-summaries/treasury/`
- 意思決定値: `shortfall_date` と `required_funding_amount` / `required_funding_by_date`
- Chat validate: `operator_validate_status`（`chat:read`、L1-safe）

## 禁止

- 口座番号の出力（`BANK-xxx` ID のみ）
