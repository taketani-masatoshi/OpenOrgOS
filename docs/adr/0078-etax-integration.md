# ADR 0078: Independent NTA e-Tax (KSK2) integration module

- **Status:** Accepted
- **Date:** 2026-09-20
- **Amends:** [0052](0052-tax-filing-phase5-deferred.md), [0051](0051-jp-tax-skills-cli-only.md), [0058](0058-orgos-ledger-product-layer.md)

## Context

Existing tax modules (`jp_tax_corporate`, `jp_tax_consumption`, `jp_consumption_refund`, advisor handoff) are designed as:

- 税理士確認用
- `not-for-etax`
- not official NTA XML
- no electronic signature
- no e-Tax transmission

ADR 0052 Phase 5c said OrgOS would not implement production e-Tax submit. Product terms and Ledger SKU still exclude e-Tax from the accounting product. That boundary is correct for **tax calculation / return preparation**.

A separate, explicit integration with 国税庁 e-Tax is now required. Putting send/sign into the existing tax modules would collapse that safety boundary.

## Decision

1. Add jurisdiction module **`jp_etax`** as the only OrgOS path to NTA e-Tax.
2. Input is a hash-bound **ReturnPackage** from upstream tax modules. `jp_etax` does not calculate tax.
3. Baseline specification is **KSK2対応版** (listing 2026-08-28, reception 2026-09-24). Do not mix with the current-operation pack at `shiyo/shiyo3.htm`.
4. Safety gates are independent: structural XSD → specification rules → OrgOS (identity, hash, approval, signature, duplicate, environment) → transport → receipt.
5. Signature and transport are **adapters** over NTA-distributed modules/APIs. No homegrown crypto.
6. Production submit is fail-closed until NTA transmission test evidence and the production-gate checklist are complete. An environment variable cannot enable production.

## Boundary

```text
Tax calculation / return preparation   (unchanged, not-for-etax)
        ↓ Approved ReturnPackage
e-Tax integration module               (jp_etax)
        ↓ KSK2 XML + official signature/transport
NTA e-Tax
```

`RECEIVED_BY_ETAX` means the agency accepted a message. It does not mean the return is tax-correct. Names such as `TAX_RETURN_APPROVED` are forbidden.

## Safety

- `contentHash` binds approval, signature, and submit readiness. One-byte change invalidates all three.
- Duplicate identity = taxpayer + procedure + tax year + revision + document hash.
- Unsupported procedures are fail-closed. Production allows `SUPPORTED` only.
- Secrets (PIN, private key, password) are never stored in OrgOS YAML/DB or written to logs.

## Compatibility

KSK2対応仕様 is the baseline. Schema/mapping/procedure metadata is data-driven. Year-specific `if (year === 2026)` trees in code are forbidden.

Unknown NTA rules are `SPEC_BLOCKED`. The implementation must not invent XML.

## Production Gate

Implementation complete ≠ e-Tax対応完了.

**e-Tax対応完了** (RHO0010 only) means `evaluateProductionEnablement().certified === true` **and** RHO0010 is `SUPPORTED` with `productionEligible: true`, after Windows host bind, e-tax18 receipt map, NTA transmission evidence, and human `etax production release --approval-id`. See [IMPLEMENTATION_PLAN.md](../etax/IMPLEMENTATION_PLAN.md) D1–D8 and [CERTIFICATION_CHECKLIST.md](../etax/CERTIFICATION_CHECKLIST.md).

```text
implementation → local conformance → NTA transmission test → evidence
  → production enablement review → production release → production
```

Until certified, CLI/UI must show:

`e-Tax production submission: NOT CERTIFIED / DISABLED`

When certified (derived, never hard-coded true in tip without gate evidence):

`e-Tax production submission: CERTIFIED / ENABLED (RHO0010)`

## Consequences

- Tax Agent still must not auto-submit. It may hand a ReturnPackage to `jp_etax`.
- Ledger commercial claims remain “e-Tax not included” until a separate SKU enablement.
- ADR 0052 5c is amended: OrgOS tax-prep still does not submit; `jp_etax` may, after gates.

## Related

- [docs/etax/IMPLEMENTATION_PLAN.md](../etax/IMPLEMENTATION_PLAN.md)
- [docs/etax/THREAT_MODEL.md](../etax/THREAT_MODEL.md)
- [tax-filing-spec.md](../org-os/tax-filing-spec.md)
