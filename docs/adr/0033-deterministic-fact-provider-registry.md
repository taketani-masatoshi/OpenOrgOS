# ADR 0033 — Deterministic Fact Provider Registry

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** OrgOS maintainers

## Context

Steward Chat / Secretary answered 「従業員数は？」 with a refusal essay because:

1. Today context did not include HR headcount
2. LLM tools had no HR reader
3. Orchestration keywords did not route to `human_resources`

Finance and contract KPIs already had one-off deterministic pre-handlers. Adding another domain the same way would duplicate chat-api blocks, refusal guards, and grounding text.

## Decision

Introduce a **Fact Provider Registry** (`src/lib/operator-facts/`) where each domain declares:

- intent / topic regexes
- `run()` + `format()` (deterministic L1)
- LLM tool name
- owner agent + escalate path
- optional `escalateOnUnregistered`

Chat routing, tool definitions, grounding rules, and post-LLM refusal recovery are generated from the registry.

First native provider: **HR headcount** (`orgos hr headcount`, Skill `hr_headcount`). Finance and contract wrap existing intent modules as adapters (no logic move).

When `coverage === "unregistered"` and `escalateOnUnregistered`, the platform files a **real Work Order** via `runEscalation` (no simulated delegation).

## Consequences

### Positive

- New L1 facts need one provider file, not four copy-pasted chat-api branches
- Secretary / Executive can answer headcount without inventing numbers
- Empty tenants get an honest「未登録」+ IMP to Human Resources

### Negative / trade-offs

- Adapter providers cast `{ test }` as `RegExp` for finance/contract (acceptable until those intents move fully into the registry)
- Work Order is filed but **not** auto-dispatched (existing `orgos agent dispatch` remains separate)

## Related

- [0032-amount-free-receipt-wire-claim.md](0032-amount-free-receipt-wire-claim.md)
- `src/lib/operator-facts/`
- `src/lib/hr/headcount-view.ts`
- `steward/core/skills/hr_headcount.md`
