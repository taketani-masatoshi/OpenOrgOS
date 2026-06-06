# Steward OS — ドキュメント（人が読むもの）

**このフォルダには Markdown（`.md`）と CSV（`.csv`）のみ置きます。**  
YAML や CLI 用データは [`cursor/`](../cursor/) に集約されています。

## 構成

```
docs/
├── README.md          ← 今ここ
├── spec-v0.2.md       仕様書
├── web-updates.md     運用手順
├── plans/             決算書・予実表など（.md のみ）
├── data/              計画数値表（.csv のみ）
└── reports/           CLI 生成レポート（.md のみ）
```

```
cursor/
├── data/              正データ（.yaml のみ）
├── schemas/           検証スキーマ
├── assets/            フォント等
└── reports/           生成 PDF（.pdf のみ）
```

## 目次

| ファイル | 内容 |
|---------|------|
| [spec-v0.2.md](spec-v0.2.md) | システム仕様・MVP 機能 |
| [plans/fy2026-pl.md](plans/fy2026-pl.md) | FY2026 決算書 |
| [plans/2026-yojitsu.md](plans/2026-yojitsu.md) | 2026年 予実（暦年・参照用） |
| [data/](data/) | 売上・利益・費用・投資計画 CSV |
| [web-updates.md](web-updates.md) | Web 更新手順 |

## YAML との対応

| 人向け（docs/） | 正データ（cursor/data/） |
|----------------|-------------------------|
| [plans/fy2026-pl.md](plans/fy2026-pl.md) | `plans/yojitsu-fy2026.yaml` |
| [data/売上計画.csv](data/売上計画.csv) | `plans/revenue-plan.yaml` |
| [data/利益計画.csv](data/利益計画.csv) | `plans/profit-plan.yaml` |

## 更新ルール

1. **数値** → 先に `cursor/data/` の YAML を更新 → `npm run validate`
2. **CSV** → YAML と同内容になるよう `docs/data/` を同期
3. **決算書・説明文** → `docs/plans/` の Markdown を更新
