# OOO Gate Matrix — Correspondence (Email · Slack)

**Status:** Active · **Scope:** OrgOS Steward outbound correspondence  
**Related:** [mail-context-compose-pipeline.md](./mail-context-compose-pipeline.md)

## Purpose

Human-out-of-the-loop (OOO) safety for **all external correspondence** — not only email compose. Every draft and send path runs the same deterministic gates where applicable.

## Gate matrix

| Gate | Email draft | Email send | Slack draft | Slack send | Audit on reject |
|------|-------------|------------|-------------|------------|-----------------|
| Recipient registry (`external-contacts`) | ✓ | ✓ | — | — | ✓ |
| Slack channel required | — | — | ✓ | ✓ | ✓ |
| Amount ↔ verified claims | ✓ | ✓ | ✓ | ✓ | ✓ |
| Date ↔ verified claims | ✓ | ✓ | ✓* | ✓* | ✓ |
| Fulfillment (在庫/納期/出荷…) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Attachment allowlist | ✓ | ✓ | ✓ | ✓ | ✓ |
| Style lint (禁句・秘書体裁) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Org approval | ✓ | ✓ | ✓ | ✓ | — |
| Human operator (ceo/approver) send | — | ✓ | — | ✓ | ✓ |

\*When `claims-json:` pack is present in draft notes.

## Implementation paths

| Stage | Module | Entry |
|-------|--------|-------|
| Draft create | `src/lib/correspondence/draft.ts` | `runCorrespondenceOutboundGates` → `assertOutboundCorrespondenceDraft` + `assertCorrespondenceStyleLint` |
| Approved send | `src/lib/correspondence/send-gate.ts` | Same wrapper before SMTP / Slack |
| Claims / amounts | `src/lib/correspondence/claims-assert.ts` | `extractAmounts`, `assertFulfillmentLanguage`, channel-specific asserts |
| Rejection audit | `src/lib/correspondence/correspondence-gate-audit.ts` | `recordCorrespondenceGateRejection` → `audit.jsonl` event `correspondence_gate` |

## Claims hardening (2026-08)

- Full-width digits normalized before amount scan (`１００万円` → `100`)
- `万円` / `100万` patterns require verified amount claims
- Fulfillment keywords: whitespace-collapsed scan blocks `在 庫` obfuscation
- Extended terms: 出荷, 配送, inventory, stock

## Audit detail format (L1)

```
{gate}:{channel}:{reason}
```

Example: `fulfillment:slack:納期の記述がありますが、delivery claim が未確認です`

No L2 body content is written to audit rows.

## Out of scope (separate tracks)

| Item | Owner |
|------|-------|
| Community Web UI compose | OS_Community |
| Live Gmail OAuth E2E | Manual / staging |
| PassKey / SSO production proof | Operator runbook |

## Verification

```bash
npx vitest run tests/correspondence-ooo-gate.test.ts tests/correspondence-compose-golden.test.ts tests/correspondence-approval-gate.test.ts
```
