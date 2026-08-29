# jp_consumption_refund seeds

テナント正本: `data/tax/consumption-refund-claims.yaml`

金額は Assessment（`orgos tax consumption --period`）からコピーする。手入力しない。
口座は `refund_bank_account_id` のみ。入金仕訳は `orgos operations consumption-refund receive`（人間）。

税カレンダーに還付入金予定を載せる場合（任意 · mal には入れない）:

```yaml
# data/finance/tax-profile.yaml  obligation_rhythms[]
- id: consumption-refund-expected
  kind: tax
  label: 消費税還付入金予定
  cadence: annual
  due_rule: fiscal_plus_2_months
  enabled: true
  apply_when: has_open_consumption_refund
  amount:
    mode: formula
    formula: consumption_refund_open
  cashflow_category: consumption_tax_refund
```

CLAIM の `filed_by_human` 行があれば、rhythm がなくてもカレンダーに入金予定が出る。
