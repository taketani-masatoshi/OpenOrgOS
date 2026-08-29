# Skill: trial_balance_export_csv（試算表 CSV エクスポート）

**Path:** `steward/core/skills/trial_balance_export_csv.md`
**Runtime:** `cli`

## 目的

`orgos ledger trial-balance` の結果を **試算表.csv** として `docs/finance/accounting/records/` にミラーする。

## CLI

```bash
STEWARD_TENANT=mal npm run orgos -- ledger export --template trial-balance-csv --as-of 2026-08-31
STEWARD_TENANT=mal npm run orgos -- skills run trial-balance-export-csv --month 2026-08
```

## 関連

- [journal_export_csv.md](journal_export_csv.md)
- [file-based-accounting-runbook.md](../../../../tenants/mal/docs/finance/file-based-accounting-runbook.md)
