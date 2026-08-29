# 税務申告チェックリスト — 第9期

**株式会社MAL · 2026-02-01〜2027-01-31 · 決算月1月**
**正データ:** [`data/finance/tax-profile.yaml`](../../../data/finance/tax-profile.yaml)

*本ファイルは `orgos skills run tax-filing-prep` により正データから生成されます。*

## 申告スケジュール

| 税目 | 期限 | 提出先 | 状態 |
|------|------|--------|:----:|
| 法人税（国税） | 2027-03-31 | 国税庁（e-Tax） | ○ |
| 消費税 | 2027-03-31 | 国税庁（e-Tax） | ○ |
| 法人住民税・法人都民税 | 2027-03-31 | 東京都（eLTAX） | ○ |
| 法人事業税 | 2027-03-31 | 東京都（eLTAX） | ○ |
| 固定資産税（償却資産申告） | 2027-01-31 | 千代田区・墨田区 | ○ |
| 源泉所得税・法定調書 | 2027-01-31 | 税務署 | 該当（概算） |

## 区分・見込

- 消費税: 免税事業者
- 法人税見込: ￥775,000（暫定）
- インボイス: T4010001189530

## 数値サマリ（予実 YAML）

| 項目 | 金額（円） |
|------|----------:|
| 売上高 | 7,500,000 |
| 営業利益 | 4,166,309 |
| 税引前当期純利益 | 4,166,309 |
| 法人税等（暫定） | 775,000 |
| 当期純利益（暫定） | 3,391,309 |

## 実行 CLI

```bash
npm run validate
npm run orgos -- deps check --file data/finance/fixed-assets.yaml
npm run orgos -- tax calendar
npm run orgos -- tax gaps
npm run orgos -- report kessan
```

*生成: orgos skills run tax-filing-prep · 2026-08-29*