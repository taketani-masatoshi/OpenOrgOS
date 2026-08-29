# Skill: journal_export_csv（仕訳 CSV エクスポート）

**Path:** `steward/core/skills/journal_export_csv.md`
**Runtime:** `cli`

## 目的

`journal-entries.yaml`（SSOT）から人間可読の **仕訳一覧 CSV** を `docs/finance/accounting/records/` にミラーする。会計 SaaS 非導入時の税理士提出・監査用。

## 入力

- `data/finance/journal-entries.yaml`
- `data/finance/chart-of-accounts.yaml`（科目名参照 · validate 連携）

## 出力

| 種別 | パス |
|------|------|
| ミラー CSV | `docs/finance/accounting/records/仕訳一覧.csv` |
| 様式 | `docs/finance/accounting/templates/仕訳一覧.csv` |

## 使用 Agent

Accounting Agent · Finance Agent

## CLI

```bash
# 既定パスへ書き出し
STEWARD_TENANT=mal npm run orgos -- ledger export

# 期間指定
STEWARD_TENANT=mal npm run orgos -- ledger export --from 2026-08-01 --to 2026-08-31

# Skill 経由（月次 close 後）
STEWARD_TENANT=mal npm run orgos -- skills run journal-export-csv

# 確認のみ（stdout）
STEWARD_TENANT=mal npm run orgos -- ledger export --dry-run
```

## 関連

- [file-based-accounting-runbook.md](../../../../tenants/mal/docs/finance/file-based-accounting-runbook.md)
- [monthly_close.md](monthly_close.md)
- [general-ledger-spec.md](../../../../docs/org-os/general-ledger-spec.md)
