# 税理士引き渡しチェックリスト — 令和8年分

| 項目 | 状態 |
|------|------|
| 仕訳帳 · 総勘定元帳 | `books` 出力を確認 |
| 青色申告決算書（一般用） | `kessan` ドラフト |
| 確定申告書B | `shinkoku-b` ドラフト |
| 青色特別控除 cap | 550000 円 |
| 家事按分（事業分経費） | 0 円（総額 0） |
| 消費税 | 免税事業者 · 申告不要 · `docs/finance/tax/consumption/2026/consumption-tax-draft-return.md` |
| e-Tax 送信 | **人間 / 税理士**（OrgOS 範囲外） |

提出期限の目安: 翌年3月15日。65万円には期限内 e-Tax または優良電子帳簿届出が必要。

## 家事按分

- 設定: `data/finance/blue-return-allocation.yaml`
- 家事分は **事業主貸** での記帳を推奨。本モジュールは自動振替しない。
- 仕訳が既に事業分のみのときは `business_pct: 100`（二重控除防止）。
- 家事按分: 仕訳が総額のとき business_pct で事業分のみを決算・経費帳に載せる。既に事業分のみ仕訳している場合は 100% のままにすること（二重控除防止）。家事分の自動・事業主貸振替は行わない。

## 消費税

- `orgos operations tax-consumption draft-return --year 2026` で年次ドラフトを再生成。
- 課税事業者は売上仕訳に `tax_category` を付与すること。

## モジュール整合
