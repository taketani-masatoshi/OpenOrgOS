# e-Tax Integration Threat Model

**Module:** `jp_etax` · **Status:** Implementation-100 (production disabled) · **Date:** 2026-09-21

Production submission is disabled. This model still applies to mock/test paths so secrets cannot leak before certification.

## Assets

| Asset | Classification | Store |
|-------|----------------|--------|
| ReturnPackage payload (amounts, taxpayer id) | L1 | `data/etax/packages.yaml` |
| Official XML / hashes | L1 | tenant etax dir (Phase 2+) |
| e-Tax 受付番号 | L1 | submissions + receipts |
| Electronic certificate / private key / PIN | L2–L3 | **never** in OrgOS DB or git |
| Production/test credentials | L2 | gitignored `data/etax/credentials/` |
| Audit JSONL | L1 (redacted) | `data/etax/audit.jsonl` |

## Adversaries

- Malicious or confused LLM operator trying to submit without human approval
- Replay of an old approval after XML mutation
- Duplicate submit on timeout
- Log scraping for PIN/password
- XXE / XML injection against the validator
- Mixing current-e-Tax (shiyo3) schemas with KSK2
- Enabling production with a single environment variable
- Using `not-for-etax` advisor XML as if it were KSK2

## Controls (Phase 1–3 implemented)

| Threat | Control |
|--------|---------|
| Env-var production enable | `production-gate.yaml` AND seven requirements; `ORGOS_ETAX_PRODUCTION=1` ignored |
| Guessed XML | `generateOfficialXml` throws `SPEC_BLOCKED` |
| Unsupported procedure | Empty matrix + fail-closed `UNSUPPORTED` |
| Hash swap after approve | `contentHash` recompute; mismatch invalidates approval/signature/ready |
| Duplicate identity | Filing **slot** key = taxpayer+procedure+year+revision (no hash); contentHash binds approval/signature/ready |
| Secrets in logs | `redactEtaxRecord` / private-key block strip |
| Mixing spec families | manifest `mix_legacy_specs: false`; KSK2 URLs only |
| LLM approval | `requireCliHumanApproval`; ADR 0038; `org approval` applies etax with rollback |
| XXE | `xmllint --nonet` + DOCTYPE reject |
| Homegrown XML-DSig / invented COM CLI | e-tax05 catalog only; official adapter `SPEC_BLOCKED` until hostBound ([HOST_CONTRACT.md](HOST_CONTRACT.md)) |
| Mock treated as legal signature | `legal: false`; mock forbidden outside `--env mock`; production still disabled |
| PIN in YAML/CLI | credentials example has no password field; `--password` is not a CLI flag |
| Invented send/receive HTTP | e-tax04 catalog only; official transport `SPEC_BLOCKED` until hostBound |
| Duplicate submit after timeout | slot key + stored requestId replay; `RECEIVED_BY_ETAX` refuses resend |
| Approval replay after XML change | org approval message binds `contentHash`; mismatch fails |
| CLI production enable | `etax production enable` cannot write `production-gate.yaml` |
| Manifest-only “registered” | `ksk2SpecRegistered` requires on-disk SHA match for the required CAB set |

## Controls (later / external)

| Threat | Control |
|--------|---------|
| TLS / cert validation | Official send/receive module once the COM host is bound |
| Least privilege | Dedicated production credentials, separate from test (human Phase 8) |

## Residual risk

- NTA CABs are third-party binaries; hash them, do not execute untrusted macros from Office specs on a build agent.
- Until NTA transmission test evidence exists, any “success” is mock-only.
- Listed CAB sizes on the NTA HTML table have already disagreed with a retrieved file (`e-tax05`); always trust the SHA-256 of the bytes, not the HTML.
