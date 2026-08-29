# 消費税集計仕様

**実装:** `src/lib/finance/consumption-tax.ts` · **CLI:** `orgos tax consumption`

- 課税区分: taxable_10 / taxable_8 / exempt / non_taxable / out_of_scope / tax_free
- 経過措置: `transitional_deduction_rate_pct` 80 または 50
- 申告書は生成しない（税理士受け渡し用集計のみ）
- CLI: `orgos tax consumption` · `orgos tax consumption-eligibility` · `orgos operations tax-consumption {check,calc,eligibility}`
- 還付手続・輸出還付パックは **このモジュールの外**（`jp_consumption_refund`）。[consumption-tax-refund-spec.md](./consumption-tax-refund-spec.md) · ADR [0056](../adr/0056-consumption-tax-assessment-vs-refund.md)
