# e-Tax Integration — Implementation Plan

**Status:** Phase 1 in progress · **EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION**  
**Date:** 2026-09-20 · **ADR:** [0078](../adr/0078-etax-integration.md)

This document is the repository investigation record and the phased plan. It is not a claim that OpenOrgOS is e-Tax certified.

---

## 1. Architecture findings (pre-code)

OpenOrgOS is a 4-layer OrgOS: Executive Steward → Agent → Skill + CLI → YAML/MD data. Business modules live in `steward/modules/` or `steward/jurisdiction-packs/JP/modules/`, with runtime enablement in tenant `modules.yaml`. CLI is `orgos` (not `ooo`). Commands go `CLI → src/commands/ → src/lib/ → YAML`.

Relevant existing pieces:

| Area | Where | Implication |
|------|--------|-------------|
| Module architecture | `steward/jurisdiction-packs/JP/modules/*/`, `src/lib/module-cli.ts` | New module `jp_etax`, not a new framework |
| CLI | `src/cli.ts` · `src/cli/registrars/` · `orgos tax` / `orgos operations tax-corporate` | Public surface is `orgos etax`; module alias `orgos operations etax` |
| Approval | ADR 0038 `HumanApprovalContext` · `src/lib/org/approval/` | Reuse org approval; do not invent a second ceremony |
| Action execution | Chat command router ADR 0035 · CLI `requireCliHumanApproval` | Production submit uses the human CLI/UI path |
| Event / audit | `docs/company/events/` · `schemas/audit-log.ts` (closed enum) · module `audit.jsonl` (medical-device pattern) | e-Tax events go to `data/etax/audit.jsonl` |
| Identity | `tenants/*/data/org/operators.yaml` · PassKey / SSO | Taxpayer identity is a ReturnPackage field, not a new IdP |
| Secrets | gitignore · `tenants/*/data/secrets/` · no private keys in YAML | Certificates stay outside the DB; only ids/hashes in audit |
| Tax / accounting | `jp_tax_corporate` · `jp_tax_consumption` · `tax-handoff-package` · `jp-corporate-tax-xml.ts` | Stay `not-for-etax`. Do not add submit there |
| Feature gates | ADR 0004 Gmail (env + shipped flag) | e-Tax production is **stricter**: catalog `production-gate.yaml` AND seven requirements. `ORGOS_ETAX_PRODUCTION=1` is ignored |
| Tests | Vitest 3-axis · catalog harness · `npm run test:registry:sync` | Dedicated `tests/etax-*.test.ts` + `tests/catalog/jp-etax.test.ts` |

Command naming: `orgos <domain> <verb>`. Environment flags: `--json`. Mutation: `--operator-id`. Human approval: `chat:approve` + ceo/approver, no dev bypass.

Database: there is no application SQL database for this path. Tenant YAML + JSONL is SSOT.

---

## 2. Related ADRs / policy / product

| Document | Current statement | This work |
|----------|-------------------|-----------|
| ADR 0052 | Phase 5c e-Tax submit is human/税理士; OrgOS does not implement 5c | **Amended:** 5c stays out of tax-calc modules. Dedicated `jp_etax` may implement transmission after NTA test |
| ADR 0051 | 申告書 XML · e-Tax 提出はスコープ外 | Tax **skills** remain CLI-only and non-submitting. `jp_etax` is a different module |
| ADR 0058 | e-Tax is a separate SKU, not bundled in Ledger | Unchanged. `jp_etax` is that module |
| ADR 0056 | 還付 Fulfilment は人間記録まで。e-Tax しない | Unchanged for `jp_consumption_refund`. Filing over e-Tax would be `jp_etax` later |
| ADR 0014 | National eID first; no commercial ESP; PIN stays on device | e-Tax signature uses NTA official module adapter, same “no private key in OrgOS” rule |
| ADR 0038 | HumanApprovalContext for every final approval | Production submit binds this to `contentHash` (Phase 6) |
| [tax-filing-spec.md](../org-os/tax-filing-spec.md) | e-Tax 本番提出はスコープ外 | Amended: out of tax-prep; in `jp_etax` only |
| [terms-of-service.md](../product/legal/terms-of-service.md) | e-Tax は標準範囲に含まない | Unchanged; optional module, production disabled |
| Commercial declaration | “e-Tax 提出は含みません” | Unchanged until Phase 8 |

Existing XML (`OrgOSCorporateTaxDraft`, `submission="not-for-etax"`) is **not** KSK2 XML and must never be submitted.

---

## 3. Intended files (Phase 1+)

| Path | Role |
|------|------|
| `docs/etax/**` | Plan, threat model, operator docs, gates |
| `docs/adr/0078-etax-integration.md` | Decision |
| `steward/jurisdiction-packs/JP/modules/jp_etax/**` | Catalog module, spec manifest, production gate |
| `schemas/etax/**` | ReturnPackage, status, errors |
| `src/lib/etax/**` | Domain |
| `src/commands/etax.ts` · `src/cli/registrars/etax.ts` | CLI |
| `tests/etax-*.test.ts` · `tests/catalog/jp-etax.test.ts` | Tests |

Tax-calc files (`src/lib/finance/jp-corporate-tax-xml.ts`, `src/lib/tax/tax-handoff-package.ts`) are **not** given submit methods.

---

## 4. KSK2 spec retrieval (2026-09-20)

Authoritative listing: https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo3.htm  
Hub: https://www.e-tax.nta.go.jp/shiyo/ksk2/ksk2_shiyo.htm  
**Do not use** https://www.e-tax.nta.go.jp/shiyo/shiyo3.htm as the KSK2 baseline (that is the currently operating e-Tax pack, last bulk update 2026-05-18).

| Fact | Value |
|------|--------|
| Family | KSK2 |
| Listing published | 2026-08-28 |
| Reception start (this drop) | 2026-09-24 |
| Correction | 2026-09-10 — some 8/28 files were the **previous** version; re-download required |
| Terms | Downloading CABs = agree to NTA 仕様公開注意事項 |
| Transmission test | Apply via NTA “電子メールによるお問い合わせ” on the KSK2 hub |
| Manifest | `steward/jurisdiction-packs/JP/modules/jp_etax/spec/manifest.json` |

Phase 1 retrieved `e-tax05.CAB` (signature module interface). NTA table said ~15.4KB; retrieved size was 16,241,315 bytes. SHA-256 is in the manifest. That size mismatch is recorded; we do not “fix” it by guessing. Other CABs remain `listed` / `SPEC_BLOCKED` until fetched. Official XSD (`e-tax19.CAB`) is **not** unpacked; XML generation is refused.

---

## 5. Proposed architecture

```text
jp_tax_* / handoff          jp_etax                         NTA
calculation, drafts   →     spec-registry                   e-Tax
not-for-etax XML            mapper (Phase 2)
Approved ReturnPackage  →   xml-generator (XSD)      →      KSK2 XML
                            validator L1/L2/L3
                            org approval (hash-bound)
                            SignatureProvider adapter →     official signature module
                            EtaxTransport adapter     →     send/receive module / API
                            receipt-adapter           ←     受付発行 XML
                            submission-state + audit
```

`jp_etax` must not compute tax. `GENERATED` is not an official return. `RECEIVED_BY_ETAX` is not tax-correctness.

Environments: `mock` | `test` | `production`. Production is disabled until every row in `production-gate.yaml` is true **and** NTA evidence exists. An env var cannot enable it.

---

## 6. Implementation phases

| Phase | Scope | Production |
|-------|--------|------------|
| **1** | Investigation, ADR, spec registry, ReturnPackage, state machine, CLI surface, fail-closed gates | disabled |
| **2** | Mapper, official XML, XSD validation, local tests | disabled |
| **3** | Signature adapters (mock + official module) | disabled |
| **4** | Transport adapters (mock + test env) | disabled |
| **5** | Receipt, retry/idempotency, audit completeness | disabled |
| **6** | Org approval + CLI/Web (hash-bound) | disabled |
| **7** | NTA transmission test + evidence | disabled |
| **8** | Production enablement review | enable only after checklist |

This repository change is Phase 1. Later phases must not skip SPEC_BLOCKED items by inventing schema.

---

## 7. SPEC_BLOCKED (do not guess)

Until the corresponding KSK2 CAB is retrieved **and** unpacked:

- Official XML element names, namespaces, and field IDs
- Procedure codes and form combinations
- Inter-form dependency rules
- Reception-system and API wire format
- Official signature module CLI/COM contract
- Send/receive module contract
- Receipt XML field map
- Sample/golden XML from NTA (if any exist inside the packs)

Phase 1 therefore creates packages and state only. `orgos etax build` will not emit KSK2 XML. `orgos etax submit --env production` fails closed.
