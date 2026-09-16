# platform/finance — 帳簿・決算の共有標準

個人事業主（青色）と法人（法人税・資金繰り・財務監査）で **同じ投入口と取込 CLI** を使う。

| パス | 役割 |
|------|------|
| `ingest-inbox/` | `docs/io/inbox/{bank,card,…}` のカテゴリ README 正本 |
| `src/lib/finance/ingest/` | `orgos ingest` 実装（scan → parse → classify → review → post） |
| ADR [0073](../../../docs/adr/0073-finance-ingest-pipeline.md) | 決定記録 |

## フォルダ俯瞰（テナント）

```
tenants/{id}/
├── docs/io/
│   ├── 00-README.md
│   └── inbox/
│       ├── bank/          … 銀行 CSV
│       ├── card/          … クレジット CSV
│       ├── transit/       … Suica 等
│       ├── wallet/        … PayPay 等
│       ├── marketplace/   … Amazon 等
│       ├── sales/         … 売上・請求 CSV
│       ├── receipts/      … 領収書 MD/TXT
│       └── contracts/     … 契約概要（仕訳なし）
├── data/finance/
│   ├── journal-entries.yaml     … 仕訳正本（ADR 0041）
│   ├── chart-of-accounts.yaml
│   ├── ingest-staging.yaml      … 取込途中
│   ├── ingest-rules.yaml        … 摘要→科目
│   └── …
├── docs/finance/
│   ├── accounting/              … 請求・領収索引（Core）
│   ├── blue-return/{year}/      … 個人青（モジュール）
│   ├── statements/{year}/       … PL/BS 等
│   ├── tax/                     … 消費・源泉ドラフト
│   └── treasury/                … 資金繰り（jp_bank_corporate）
└── docs/audit/financial/{period}/ … 内部財務 WP（jp_financial_audit）
```

**inbox の生 CSV は gitignore。** 各カテゴリの `00-このフォルダについて.md` のみ追跡。

## いつ作るか

| 契機 | API |
|------|-----|
| `orgos tenant scaffold-docs` | `ensureFinanceIngestInboxScaffold`（Core） |
| `orgos modules activate <id>` | 上表の財務モジュール時 |
| Ledger provision | テナント作成時 |
| `orgos ingest scaffold` / `status` / `scan` | 明示・運用時 |

対象モジュール id: `jp_sole_proprietor_blue_return` · `jp_bank_corporate` · `jp_tax_corporate` · `jp_tax_consumption` · `jp_financial_audit` · `jp_invoice_qualified` · `jp_withholding_statutory` · `jp_payroll`

## CLI（個人・法人共通）

```bash
orgos ingest scaffold
orgos ingest scan --write
orgos ingest parse --source card --write
orgos ingest classify --write
orgos ingest review
orgos ingest post --batch <id> --write
```

`ingest status` は読取のみ（フォルダを作らない）。README 正本の編集は `steward/platform/finance/ingest-inbox/` → `node --import tsx scripts/sync-finance-ingest-inbox.ts`。

デモ例: `tenants/klab/docs/io/examples/demo-card-2025-06.csv` を `inbox/card/` にコピーしてから取込。

仕訳後の生成はエンティティ別:

| エンティティ | 続き |
|--------------|------|
| 個人（青色） | `operations sole-prop-blue books\|kessan\|handoff` |
| 法人 | `operations tax-corporate …` · `jp bank …` · `financial-audit …` |

PDF 抽出依存は置かない（外部で CSV/MD 化）。詳細は ADR 0073 · [tenant-document-zones.md](../../rules/tenant-document-zones.md)。
