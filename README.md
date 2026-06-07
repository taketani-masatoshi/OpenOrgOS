# Steward OS — 株式会社MAL

不動産・旅館経営の Steward OS。

**分け方の原則:** 「誰が読むか」でフォルダを決める。生成元（CLI / Cursor）では決めない。

**フォルダ索引:** サブフォルダの説明は `docs/` → `00-このフォルダについて.md`、`data/`・`scratch/`・`assets/` → `00-README.md`（エクスプローラ先頭）。全体地図: [steward/rules/repository_layout.md](steward/rules/repository_layout.md)

---

## 人はどこを見る？

**→ [`docs/`](docs/00-このフォルダについて.md) だけ**

| 見たいもの | 場所 |
|-----------|------|
| 決算書・予実 | [`docs/plans/`](docs/plans/) |
| 法人書類（議事録・PDF） | [`docs/company/`](docs/company/) |
| 契約書 | [`docs/contracts/`](docs/contracts/) |
| 計画表（CSV） | [`docs/exports/`](docs/exports/) |
| 業務台帳・名簿 | [`docs/finance/accounting/`](docs/finance/accounting/) · [`docs/company/hr/`](docs/company/hr/) · [`docs/properties/`](docs/properties/) |
| 自動レポート（MD） | [`docs/reports/`](docs/reports/) |
| ISO・現状評価 | [`docs/compliance/iso/`](docs/compliance/iso/) |

PDF（決算報告書・事業報告書）は **`docs/io/outbox/corporate/`** に出力されます。

**書類の受け渡し:** スキャン等 → [`docs/io/inbox/`](docs/io/inbox/) · 印刷用 → [`docs/io/outbox/`](docs/io/outbox/) · `npm run steward -- io status`

---

## Cursor はどこを触る？

**→ [`data/`](data/) と [`scratch/`](scratch/) のみ**

| 用途 | 場所 |
|------|------|
| 正データ（YAML） | [`data/`](data/) |
| 中間試行 | [`scratch/`](scratch/) |

`data/` に PDF や生成物は置きません（人向けは `docs/`）。

---

## プログラム（通常は触らない）

| パス | 説明 |
|------|------|
| `src/` | CLI |
| `schemas/` | データ検証定義 |
| `assets/` | PDF 用フォント等 |
| `package.json` `tsconfig.json` | 開発設定 |

---

## フォルダ全体図

```
Steward/
│
├── docs/                      【人】読む・印刷・提出
│   ├── plans/                 決算・予実 MD
│   ├── company/               法人書類 MD
│   ├── finance/               経理・会計
│   ├── compliance/            ISO・プライバシー
│   ├── properties/            物件別運用（PROP-001/002）
│   ├── io/inbox|outbox/       受信・出力トレイ
│   ├── contracts/             契約書
│   ├── exports/               表 CSV
│   └── reports/               CLI 生成 MD
│
├── data/                      【正データ】YAML
├── scratch/                   試行（gitignore）
├── steward/                   Agent · Skill · Rules · Orchestrators
│
├── assets/                    【プログラム】フォント等
├── src/                       CLI
├── schemas/                   検証定義
└── tests/
```

---

## セットアップ

```bash
npm install
npm run validate
```

## よく使うコマンド

```bash
npm run validate
npm run validate -- --warnings   # 参照警告も表示
npm run steward -- status        # データ成熟度
npm run steward -- sync all      # CSV ← YAML
npm run steward -- contracts list
npm run steward -- io status       # 受信/出力トレイ
npm run steward -- io guide        # I/O フロー
npm run steward -- dashboard       # 経営ダッシュボード（日次）→ docs/reports/dashboard/
npm run steward -- deps check --file data/...  # 編集後の影響チェック
npm run steward -- deps graph      # 依存関係マップ
npm run steward -- report annual --fy FY2026   # → docs/io/outbox/corporate/
```

詳細: [docs/spec-v0.2.md](docs/spec-v0.2.md)
