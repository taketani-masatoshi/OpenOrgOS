# 消費税集計仕様

**実装:** `src/lib/finance/consumption-tax.ts` · **CLI:** `orgos tax consumption`

- 課税区分: taxable_10 / taxable_8 / exempt / non_taxable / out_of_scope / tax_free
- 経過措置: `transitional_deduction_rate_pct` 80 または 50
- 公表欄の対応。提出しない。10% と 8% の税抜本体を、書き方で確認した第一表・第二表・付表の欄へ載せる。e-Tax は出さない。
- CLI: `orgos tax consumption` · `orgos tax consumption-eligibility` · `orgos tax consumption-return-rows --fiscal-year YYYY` · `orgos operations tax-consumption {check,calc,eligibility,return-rows}`
- 還付手続・輸出還付パックは **このモジュールの外**（`jp_consumption_refund`）。[consumption-tax-refund-spec.md](./consumption-tax-refund-spec.md) · ADR [0056](../adr/0056-consumption-tax-assessment-vs-refund.md)
