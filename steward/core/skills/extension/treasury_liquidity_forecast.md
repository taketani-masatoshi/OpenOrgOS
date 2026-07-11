# Skill: treasury_liquidity_forecast

**Path:** `steward/core/skills/extension/treasury_liquidity_forecast.md`
**Runtime:** `cli`

## 目的

週次流動性予測（資金繰り表）を生成する。

## 入力

- `data/finance/cash-balance.yaml`
- `data/finance/payment-calendar.yaml`
- `data/finance/ar-ap-ledger.yaml`
- `data/plans/yojitsu-fy*.yaml` · `debt-plan.yaml` · `payroll.yaml`

## 出力

- 週次資金繰り表 MD/CSV
- `docs/finance/treasury/cashflow-schedule/{date}-weekly.md`
- `shortfall_date` と最深不足の `required_funding_amount` / `required_funding_by_date`

## 使用 Agent

Treasury Agent · Finance Agent（委譲）

## CLI

```bash
npm run orgos -- jp bank cashflow generate --granularity weekly --horizon 13w --write
npm run orgos -- skills run jp-cashflow-schedule
npm run orgos -- validate
```

## モジュール

`jp_bank_corporate`

支払日程の正本: `data/finance/payment-calendar.yaml`。Chat validate: `operator_validate_status`（`chat:read`、L1-safe）。

## 禁止

- 振込実行の自動決定
