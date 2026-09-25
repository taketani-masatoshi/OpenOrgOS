# ADR 0080: Ledger stays shared, indirect tax is a jurisdiction port

**Status:** Accepted  
**Date:** 2026-09-21

## Context

The ledger (journals, trial balance, period lock, monthly and annual close) is one engine. Japanese consumption tax, invoice checks, book-tax adjustments, and corporate-tax XML were called from that engine without reading the tenant jurisdiction. Other TJS-11 packs only have tax-profile seeds, and several of those seeds are copies of the Hong Kong example, so seed text cannot choose an engine.

Indirect tax is not one law:

| Family | Shape | Packs | Engine |
|--------|--------|-------|--------|
| `vat_credit` | output tax minus input tax | JP, SG, AU, EU, EE, AE, TW, CN, RU | JP consumption tax only |
| `sales_tax` | no input credit, subnational nexus | US | not installed |
| `single_stage` | single-stage tax | MY (SST) | not installed |
| `none` | no general consumption tax | HK, stub | not installed |

Income tax, official returns, and e-Tax stay outside this port.

## Decision

1. **Books stay shared.** Do not fork the ledger per country. Do not rename `debit_yen`. The integer is the minor unit of the tenant currency.
2. **`indirect_tax_family` on `pack.manifest.yaml` is the dispatch key.** Do not read `indirect_tax.type` from seed YAML.
3. **Only `jurisdiction: JP` with `vat_credit` runs** `buildConsumptionTaxSummary` and `runConsumptionTaxCheck`. A missing `tax_category` on a revenue or expense line is an error only on that path.
4. **Every other family passes the monthly-close indirect-tax gate** and does not call the Japanese engine. Detail is `no indirect tax` for `none`, otherwise `indirect tax engine not installed`.
5. **`evaluateTaxAdjustment`, `buildCorporateTaxXmlDraft`, and qualified-invoice checks refuse** unless `tax_profile_schema` is `jp`.
6. **Depreciation rate tables** are read from the active pack seed (`depreciation-rates-2026.yaml`) when that file exists. A pack without the table does not inherit the Japanese rates.

Out of scope: foreign tax amounts, statutory returns, and electronic filing.

## Consequences

- A non-JP tenant can close a month without Japanese consumption-tax categories.
- Adding GST, VAT, SST, or sales tax later is a new adapter behind the same port, not a second ledger.
- Broken Hong Kong copies in other packs' tax-profile examples do not change dispatch.

## Related

- [0046-tax-obligation-rhythm-engine.md](0046-tax-obligation-rhythm-engine.md)
- [0052-tax-filing-phase5-deferred.md](0052-tax-filing-phase5-deferred.md)
- [0056-consumption-tax-assessment-vs-refund.md](0056-consumption-tax-assessment-vs-refund.md)
