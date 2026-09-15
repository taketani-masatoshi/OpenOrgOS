# 税理士引き渡しチェックリスト — 令和7年分

| 項目 | 内容 |
|------|------|
| 対象年 | 令和7年分（2025-01-01 〜 2025-12-31） |
| 提出 | **人間 / 税理士**（OrgOS は e-Tax を送信しない） |
| 提出期限の目安 | 翌年 3月15日 |
| 税務報告書インデックス | [tax-report-index.md](../../statements/2025/tax-report-index.md) |

## 目次

- [引き渡し一覧](#引き渡し一覧)
- [家事按分](#家事按分)
- [留意事項](#留意事項)

## 引き渡し一覧

| 書類 | リンク | 状態 |
|------|--------|------|
| 仕訳帳 | [shiwakecho.md](./shiwakecho.md) | 確認 |
| 総勘定元帳 | [sokanjomotocho.md](./sokanjomotocho.md) | 確認 |
| 試算表 | [shisanhyo.md](./shisanhyo.md) | 確認 |
| 青色申告決算書 | [aoiro-kessansho.md](./aoiro-kessansho.md) | ドラフト |
| 確定申告書B | [kakutei-shinkoku-b.md](./kakutei-shinkoku-b.md) | ドラフト |
| 青色特別控除 | [deduction-gate.md](./deduction-gate.md) | cap 550,000 · 適用 256,193 |
| 損益計算書（GL） | [pl.md](../../statements/2025/pl.md) | 参照 |
| 貸借対照表（GL） | [bs.md](../../statements/2025/bs.md) | 参照 |
| 家事按分（事業分経費） | — | 71,080 円（総額 71,080） |
| 消費税 | [課税ドラフト要確認](../../tax/consumption/2025/consumption-tax-draft-return.md) | 課税事業者（本則） |
| 支払調書 | [payment-slips-draft.md](../../tax/withholding/2025/payment-slips-draft.md) | ドラフト |
| e-Tax 送信 | — | **人間 / 税理士**（OrgOS 範囲外） |

> 65万円控除には期限内 e-Tax または優良電子帳簿届出が必要。[国税庁 No.2072](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm)

## 家事按分

- 設定ファイル: `data/finance/blue-return-allocation.yaml`
- 家事分は **事業主貸** での記帳を推奨（本モジュールは自動振替しない）
- 仕訳が既に事業分のみのときは `business_pct: 100`（二重控除防止）
- 家事按分: 仕訳が総額のとき business_pct で事業分のみを決算・経費帳に載せる。既に事業分のみ仕訳している場合は 100% のままにすること（二重控除防止）。家事分の自動・事業主貸振替は行わない。

## 留意事項

### 消費税

- 年次ドラフト: [consumption-tax-draft-return.md](../../tax/consumption/2025/consumption-tax-draft-return.md)
- 課税事業者は売上仕訳に `tax_category` を付与すること

### 初期セットアップ / 支出 intake

- setup ready · 未完了 intake なし

再生成例:

```bash
orgos operations sole-prop-blue handoff --year 2025
orgos operations tax-consumption draft-return --year 2025
```