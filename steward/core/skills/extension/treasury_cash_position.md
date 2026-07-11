# Skill: treasury_cash_position

**Path:** `steward/core/skills/extension/treasury_cash_position.md`
**Runtime:** `cli`

## 目的

口座別キャッシュポジション（現預金残高）を表示する。

## 入力

- `data/finance/cash-balance.yaml`（`status: confirmed`）

## 出力

- 口座別残高サマリ（`bank_account_id` のみ · L2 禁止）
- `shortfall_date` · `required_funding_amount` · `required_funding_by_date`
- `docs/reports/agent-summaries/treasury/{YYYY-MM-DD}-position.md`（任意）

## 使用 Agent

Treasury Agent

## CLI

```bash
npm run orgos -- jp bank position show
npm run orgos -- skills run jp-treasury-position
npm run orgos -- validate
```

## モジュール

`jp_bank_corporate` — Path: `steward/jurisdiction-packs/JP/modules/jp_bank_corporate/`

Chat: `operator_validate_status`（`chat:read`、L1-safe 件数・repo 相対 path/message）

## 禁止

- 口座番号の出力
