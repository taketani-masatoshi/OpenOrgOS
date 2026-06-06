# Steward OS — 株式会社MAL

不動産・旅館経営の Steward OS。

**分け方の原則:** 「誰が読むか」でフォルダを決める。生成元（CLI / Cursor）では決めない。

---

## 人はどこを見る？

**→ [`docs/`](docs/README.md) だけ**

| 見たいもの | 場所 |
|-----------|------|
| 決算書・予実 | [`docs/plans/`](docs/plans/) |
| 法人書類（議事録・PDF） | [`docs/corporate/`](docs/corporate/) |
| 契約書 | [`docs/contracts/`](docs/contracts/) |
| 計画表（CSV） | [`docs/data/`](docs/data/) |
| **業務台帳・名簿** | [`docs/operations/`](docs/operations/) |
| 自動レポート（MD） | [`docs/reports/`](docs/reports/) |
| ISO・現状評価 | [`docs/iso/`](docs/iso/) |

PDF（決算報告書・事業報告書）も **`docs/corporate/pdf/`** にあります。

---

## Cursor はどこを触る？

**→ [`cursor/data/`](cursor/data/) と [`cursor/scratch/`](cursor/scratch/) のみ**

| 用途 | 場所 |
|------|------|
| 正データ（YAML） | [`cursor/data/`](cursor/data/) |
| 中間試行 | [`cursor/scratch/`](cursor/scratch/) |

`cursor/` に PDF や生成物は置きません。

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
│   ├── corporate/             法人書類 MD
│   │   └── pdf/               決算・事業報告 PDF
│   ├── iso/                   ISO方針・ギャップ分析
│   ├── contracts/             契約書
│   ├── operations/            業務台帳・宿泊者名簿
│   ├── data/                  表 CSV
│   └── reports/               CLI 生成 MD
│
├── cursor/                    【Cursor】正データのみ
│   ├── data/                  YAML
│   └── scratch/               試行（gitignore）
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
npm run steward -- report annual --fy FY2026   # → docs/corporate/pdf/
```

詳細: [docs/spec-v0.2.md](docs/spec-v0.2.md)
