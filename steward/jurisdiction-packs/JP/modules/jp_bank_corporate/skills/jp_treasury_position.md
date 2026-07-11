# Skill: JP キャッシュポジション

**Path:** `steward/jurisdiction-packs/JP/modules/jp_bank_corporate/skills/jp_treasury_position.md`
**Runtime:** `cli` · **Agent:** Finance / Treasury

## 目的

現時点の **口座別残高** と直近 **資金ショート予測**、最深不足に対する **必要調達額** を表示する。

## CLI

```bash
orgos jp bank position show
orgos jp bank cashflow generate --granularity weekly --horizon 4w
orgos skills run jp-treasury-position
orgos validate
```

## 参照

- `shortfall_date` · `runway_days` · `required_funding_amount` · `required_funding_by_date` — 最新 cashflow schedule
- `data/finance/cash-balance.yaml` — 確定残高
- Chat tool `operator_validate_status` — `chat:read` で L1-safe validate 状態
