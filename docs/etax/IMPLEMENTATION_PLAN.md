# e-Tax Integration — Implementation Plan

**Status:** Implementation-100 in progress · production **DISABLED** · **NOT e-Tax対応完了**  
**Date:** 2026-09-21 · **ADR:** [0078](../adr/0078-etax-integration.md)

This document is the scorecard for `jp_etax`. It must not claim e-Tax certification.

---

## 100-point definition (two lanes)

### Implementation-100 (this plan’s goal)

- CLI / library path can reach `DRAFT → … → RECEIVED_BY_ETAX` on `--env mock` **without hand-placed status or hand-written xmlHash**
- Official XML for the first procedure comes only from a registered mapping YAML + KSK2 XSD
- Production stays `NOT CERTIFIED / DISABLED`; env vars cannot enable it
- Docs, readiness, and tests state the same facts

### Certification-100 (separate; not claimed here)

- Windows COM host bound (`hostBound: true`)
- NTA transmission test evidence on disk
- `production-gate.yaml` all true after human review
- Only then is “e-Tax対応完了” a candidate claim

Scaffolding Phases 1–8 alone is **not** implementation-100.

---

## Scorecard

| Lane | Focus | Status |
|------|--------|--------|
| A | Contract repair (state machine, xmlHash provenance, slot identity, approval rollback, disk SHA gate) | Required |
| B | First procedure RHO0010 (e-tax19 envelope + mapping; e-tax10 retrieved) | Required |
| C | Mock E2E without hand-placed status | Required |
| D | Host contract docs; `hostBound: false` on Darwin | Required |
| E | Honest docs / readiness `experimental` | Required |
| Cert | COM bind + NTA test + production gate | Out of scope |

---

## Architecture

```text
jp_tax_* / handoff          jp_etax                         NTA
calculation, drafts   →     spec-registry                   e-Tax
not-for-etax XML            mapper (RHO0010)
Approved ReturnPackage  →   xml-generator (XSD)      →      KSK2 XML
                            validator L1/L2/L3
                            org approval (hash-bound)
                            SignatureProvider adapter →     official signature module
                            EtaxTransport adapter     →     send/receive module
                            receipt-adapter           ←     受付発行 XML
                            submission-state + audit
```

Filing **slot** identity = `taxpayer|procedure|year|revision` (no content hash).  
`contentHash` binds approval, signature, and ready only.

---

## KSK2 baseline

| Fact | Value |
|------|--------|
| Family | KSK2 |
| Listing | https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo3.htm |
| Do not use | https://www.e-tax.nta.go.jp/shiyo/shiyo3.htm (current soft) |
| Manifest | `steward/jurisdiction-packs/JP/modules/jp_etax/spec/manifest.json` |
| Required CABs for `ksk2SpecRegistered` | e-tax01, 04, 05, 07, 08, 10, 19 (on-disk SHA == manifest) |

First OpenOrgOS procedure: **RHO0010** (普通法人の確定申告・青色) — `EXPERIMENTAL`, `productionEligible: false`.

---

## SPEC_BLOCKED (must stay honest)

- Full e-tax10 field workbook → complete mapping for every form
- e-tax08 inter-form rules as loaded data (HOA110 treated as no-dependency for minimal path)
- Official signature / transport **host bind**
- e-tax18 receipt field map as OpenOrgOS data
- NTA transmission test evidence
- `production_submission_enabled`

See also [HOST_CONTRACT.md](HOST_CONTRACT.md).

---

## Related ADR / policy

| Document | Role |
|----------|------|
| ADR 0078 | Independent `jp_etax` module |
| ADR 0052 / 0051 | Tax-calc modules stay not-for-etax |
| ADR 0038 | Hash-bound human approval |
| ADR 0014 | No private key / PIN in OrgOS |

Tax-calc files must not gain submit methods.
