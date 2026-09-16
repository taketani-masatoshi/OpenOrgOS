# docs/io/inbox — 書類・明細の投入口（モジュール標準）

**正本（テンプレ）:** `steward/platform/finance/ingest-inbox/`  
テナントへは `orgos ingest scaffold` / `tenant scaffold-docs` / 財務モジュール activate で複製する。

紙・スキャン・ダウンロードしたファイルをカテゴリ別に置き、`orgos io` / `orgos ingest` で台帳登録します。**個人事業主・法人で同一構成**です。

| フォルダ | 用途 |
|----------|------|
| `bank/` | 銀行明細 CSV |
| `card/` | クレジット明細 CSV |
| `transit/` | Suica / PASMO 等 CSV |
| `wallet/` | PayPay 等 CSV |
| `marketplace/` | Amazon 等 購入明細 CSV |
| `sales/` | 売上・請求 CSV |
| `receipts/` | 領収書 MD/TXT/CSV |
| `contracts/` | 契約概要 MD（仕訳なし） |
| `licenses/` · `applications/` · `corporate/` · `misc/` | 既存 document-io（非仕訳） |

生ファイルは gitignore。各フォルダの `00-このフォルダについて.md` のみ追跡されます。

## 帳簿まで（finance ingest）

```bash
orgos ingest scaffold
orgos ingest scan --write
orgos ingest parse --source <bank|card|transit|wallet|marketplace|sales|receipts> --write
orgos ingest classify --write
orgos ingest review
orgos ingest post --batch <id> --write
```

その後（エンティティ別）:

```bash
# 個人・青色
orgos operations sole-prop-blue books --year YYYY
orgos operations sole-prop-blue kessan --year YYYY

# 法人・決算準備 / 資金 / 内部監査
orgos operations tax-corporate gaps
orgos jp bank cashflow generate --write
orgos operations financial-audit workpapers --period YYYY
```

PDF はサービス側 CSV または外部ツールでテキスト化してから投入（OrgOS に PDF 抽出依存はない）。
