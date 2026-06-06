# 計画テンプレート — 共通形式

各下位計画は以下の見出しで Markdown 化する。カテゴリ別の具体値は同フォルダ内の各ファイルを参照。

```markdown
# {計画名}

## 目的
{1–3文}

## 管理対象
- {物件ID / 契約ID / セグメント 等}

## 必要な入力情報
- {正データ YAML · 契約 · 市場データ 等}

## 出力すべき情報
- {目標値 · スケジュール · アクション · 更新ログ}

## KPI
| KPI | 目標 | 単位 | 計測頻度 |
|-----|------|------|---------|

## 関連フォルダ
- `cursor/data/...`
- `docs/...`

## 担当エージェント
- {Executive / Finance / ...}

## 更新頻度
- {年次 / 四半期 / 月次 / 随時}

## リスク
- {未更新 · 前提崩れ · 依存先未確定 等}
```

---

## カテゴリ別テンプレート

| ファイル | 計画数 |
|---------|--------|
| [01-corporate.md](01-corporate.md) | 10 |
| [02-property.md](02-property.md) | 11（×物件インスタンス） |
| [03-rental-module.md](03-rental-module.md) | 9 |
| [04-hospitality-module.md](04-hospitality-module.md) | 10 |
| [05-finance.md](05-finance.md) | 10 |
| [06-contracts.md](06-contracts.md) | 10 |
| [07-outsourcing.md](07-outsourcing.md) | 9 |
| [08-compliance.md](08-compliance.md) | 8 |
| [09-reports.md](09-reports.md) | 8 |

**合計:** 84 計画タイプ
