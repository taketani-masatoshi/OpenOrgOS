# ADR 0079 — Correspondence domain adapters

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** OrgOS maintainers

## Context

Correspondence (send-gate, CEO inline answers, style-lint, mail handoff, receive poller, case-status) imported `scheduling-coordination` directly. That created a cycle (scheduling → correspondence → scheduling), forced dynamic imports, and made correspondence know about schedule status machines.

## Decision

1. **Correspondence owns only a registration port** — `src/lib/correspondence/domain-adapters.ts` with hooks (`onDraftApproved`, `onDraftSent`, `onCeoAnswer`, `caseRef`, `onFollowUpDue`, `styleLintContext`, `handoffSection`, `handoffActions`, `onMailPoll`, tag helpers).
2. **Scheduling implements the adapter** — `src/lib/scheduling-coordination/correspondence-adapter.ts`. Tag parsing lives in `draft-tag.ts` (single regex).
3. **Bootstrap registers once** — `registerDomainAdapters()` from `src/lib/bootstrap/domain-adapters.ts`, called from CLI, Steward Chat, Operator Console, Wire Console, and `tests/setup-tenant.ts`. Idempotent.
4. **Fail-closed** — `requireCorrespondenceDomainAdapters()` throws if registration was skipped. `sendApprovedCorrespondence` checks before SMTP.
5. **Sales inquiry/deal stay in case-status** for now; only the scheduling branch uses the adapter. Sales adapterization is a follow-up.

## Consequences

- No `correspondence → scheduling-coordination` imports (architecture R1 empty).
- No dynamic imports for this boundary (R2 empty for scheduling / correspondence→scheduling).
- Reminder due is computed from `scheduling_reminder_after_hours` in the scheduling adapter (`onFollowUpDue`); generic +7d from case-status is ignored for scheduling.

## Related

- [tests/scheduling-architecture.test.ts](../../tests/scheduling-architecture.test.ts)
- [docs/org-os/scheduling-coordination-runbook.md](../org-os/scheduling-coordination-runbook.md)
