# 消費税集計仕様

**実装:** `src/lib/finance/consumption-tax.ts` · **CLI:** `orgos tax consumption`

- 課税区分: taxable_10 / taxable_8 / exempt / non_taxable / out_of_scope / tax_free
- 経過措置: `transitional_deduction_rate_pct` 80 または 50
- 公式様式と e-Tax は出さない。10%/8% 集計は対応表で第一表・付表の行に載せる
- CLI: `orgos tax consumption` · `orgos tax consumption-eligibility` · `orgos tax consumption-return-rows --fiscal-year YYYY` · `orgos operations tax-consumption {check,calc,eligibility,return-rows}`
- 還付手続・輸出還付パックは **このモジュールの外**（`jp_consumption_refund`）。[consumption-tax-refund-spec.md](./consumption-tax-refund-spec.md) · ADR [0056](../adr/0056-consumption-tax-assessment-vs-refund.md)
