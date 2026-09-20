# e-Tax Integration Threat Model

**Module:** `jp_etax` · **Status:** Phase 1 · **Date:** 2026-09-20

Production submission is disabled. This model still applies to mock/test paths so secrets cannot leak before Phase 8.

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

## Controls (Phase 1 implemented)

| Threat | Control |
|--------|---------|
| Env-var production enable | `production-gate.yaml` AND seven requirements; `ORGOS_ETAX_PRODUCTION=1` ignored |
| Guessed XML | `generateOfficialXml` throws `SPEC_BLOCKED` |
| Unsupported procedure | Empty matrix + fail-closed `UNSUPPORTED` |
| Hash swap after approve | `contentHash` recompute; mismatch invalidates approval/signature/ready |
| Duplicate identity | identity key = taxpayer+procedure+year+revision+document hash |
| Secrets in logs | `redactEtaxRecord` / private-key block strip |
| Mixing spec families | manifest `mix_legacy_specs: false`; KSK2 URLs only |
| LLM approval | `requireCliHumanApproval`; ADR 0038 (wired in Phase 6; CLI already refuses) |

## Controls (later phases)

| Threat | Planned control |
|--------|-----------------|
| XXE | Disable external entities in the XSD engine (Phase 2) |
| TLS / cert validation | Official module + platform TLS; no custom crypto (Phase 3–4) |
| Blind retry | Receipt lookup before resend (Phase 5) |
| Replay | Request ids + identity key (Phase 5) |
| Least privilege | Dedicated production credentials, separate from test (Phase 8) |

## Residual risk

- NTA CABs are third-party binaries; hash them, do not execute untrusted macros from Office specs on a build agent.
- Until NTA transmission test evidence exists, any “success” is mock-only.
- Listed CAB sizes on the NTA HTML table have already disagreed with a retrieved file (`e-tax05`); always trust the SHA-256 of the bytes, not the HTML.
