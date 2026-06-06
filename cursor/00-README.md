# Cursor ゾーン

**Cursor が読み書きする正データ（YAML）と作業用スクラッチだけ**を置くフォルダです。

人が読む書類（Markdown・CSV・**PDF**）はすべて [`docs/`](../docs/00-このフォルダについて.md) にあります。  
CLI やプログラムの資源（フォント等）は [`assets/`](../assets/00-README.md) にあります。

## 構成

```
cursor/
├── 00-README.md       ← 今ここ
├── data/           正データ（.yaml のみ）
└── scratch/        中間試行・作業用（gitignore）
```

## 各フォルダの役割

| フォルダ | 形式 | 内容 |
|---------|------|------|
| `data/` | `.yaml` | 会社・物件・契約・収支・計画の**正データ** |
| `scratch/` | 任意 | ドラフト試行、一時メモ（確定後は移動して削除） |

## ここに置かないもの

| 種類 | 正しい場所 | 理由 |
|------|-----------|------|
| PDF・議事録・契約書 | `docs/` | 人が読む |
| フォント | `assets/` | プログラム用 |
| TypeScript | `src/` `schemas/` | プログラム |

## 中間試行（`scratch/`）

| 試行中 | 確定後 |
|--------|--------|
| 契約書ドラフト | `docs/contracts/` |
| 数値試算 YAML | `cursor/data/` + `docs/data/*.csv` |
| レポート草稿 | `docs/plans/` または `docs/reports/` |

## データ更新フロー

```
1. cursor/data/*.yaml を更新
2. npm run validate
3. docs/ の CSV・MD を同期
4. npm run steward -- report ... → docs/corporate/pdf/ に PDF 生成
```

全体地図: [ルート README](../README.md)
