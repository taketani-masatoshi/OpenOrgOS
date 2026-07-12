# jp_bank_corporate seed

JP 法人口座モジュールの **テンプレート** とテナント `data/finance/` 正本の関係。

## 有効化

```bash
cp steward/jurisdiction-packs/JP/modules/jp_bank_corporate/seed/payment-calendar.yaml.example \
   tenants/{id}/data/finance/payment-calendar.yaml
cp steward/jurisdiction-packs/JP/modules/jp_bank_corporate/seed/ar-ap-ledger.yaml.example \
   tenants/{id}/data/finance/ar-ap-ledger.yaml
cp steward/jurisdiction-packs/JP/modules/jp_bank_corporate/seed/collection-terms.yaml.example \
   tenants/{id}/data/finance/collection-terms.yaml
cp steward/jurisdiction-packs/JP/modules/jp_bank_corporate/seed/bank-statements.yaml.example \
   tenants/{id}/data/finance/bank-statements.yaml
cp steward/jurisdiction-packs/JP/modules/jp_bank_corporate/seed/reconciliation-events.yaml.example \
   tenants/{id}/data/finance/reconciliation-events.yaml
```

`modules.yaml` 例:

```yaml
modules:
  - id: jp_bank_corporate
    agent: jp_bank_corporate
    enabled: true
```

## ファイル

| ファイル | 用途 |
|---------|------|
| `payment-calendar.yaml.example` | 支払カレンダー雛形 |
| `ar-ap-ledger.yaml.example` | 売掛・買掛台帳雛形 |
| `collection-terms.yaml.example` | 回収サイト既定 |
| `bank-statements.yaml.example` | 冪等 fingerprint 付き銀行取込 |
| `reconciliation-events.yaml.example` | append-only 消込・取消イベント |
| `export-templates/cash-book-csv.yaml.example` | CSV 出力列定義 |
| `export-templates/mizuho-weekly.yaml.example` | 銀行提出向け週次集約（口座 ID のみ） |
| `export-templates/tax-payment-csv.yaml.example` | 実額取得可能な税支払 CSV |

## 依存

- `data/finance/cash-balance.yaml`（confirmed 必須）
- `data/finance/monthly/` · `data/plans/`（forecast 連動）
- `data/finance/chart-of-accounts.yaml`（category → 勘定科目コード解決）

## テンプレート出力

`orgos jp bank cashflow export --template <id>` は seed の
`export-templates/{id}.yaml.example` を Zod 検証して列・区切り文字を決定する。
`cash-book-csv`、`mizuho-weekly`、`tax-payment-csv` を利用できる。銀行向け
テンプレートも `bank_account_id` のみを扱い、口座番号列は定義しない。

## 消込

`orgos jp bank reconcile auto` は一意な参照 ID 一致だけを自動確定する。
金額・日付だけの候補は `reconcile propose` に留め、`apply` / `reverse` は
`ceo` / `approver` と `finance:reconcile` permission を要求する。
