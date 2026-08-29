# JP Consumption Refund Module Agent（消費税還付申請）

**Catalog id:** `jp_consumption_refund` · **Agent proxy:** tax

## 役割

消費税還付の **クレーム（CLAIM-*）と申請パック**。金額は `jp_tax_consumption` の集計をコピーするだけ。提出は人間 / 税理士。

## CLI

```bash
orgos operations consumption-refund eligibility --period YYYY-MM
orgos operations consumption-refund propose --kind principle_net --period YYYY-MM
orgos operations consumption-refund pack --id CLAIM-YYYY-MM-principle_net
orgos operations consumption-refund file --id CLAIM-YYYY-MM-principle_net
orgos operations consumption-refund receive --id CLAIM-YYYY-MM-principle_net --bank-account-id BANK-…
```

## データ

| パス | 内容 |
|------|------|
| `data/tax/consumption-refund-claims.yaml` | CLAIM-* |
| `docs/company/tax/refund/` | L1 パック |

## 禁止

- 還付額の invent
- 簡易課税還付の自動許可
- e-Tax 送信
- クレーム金額の上書き
- 口座番号の記録（`bank_account_id` のみ）
- 実在法人名の seed 記載
