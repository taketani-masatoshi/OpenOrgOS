# ADR 0038 — HumanApprovalContext for every final approval

- **Status:** Accepted
- **Date:** 2026-08-23
- **Context:** ADR 0037 PassKey step-up covers REG-004 tier B/C amounts only. Session possession (or a library call with `operatorId`) was enough for other final approvals. LLM / MCP tools were removed in HA-1, but `approveOrgApproval` still accepted any in-process caller.

## Decision

1. **Ceremony object** — Every `approveOrgApproval` requires a `HumanApprovalContext`: HMAC signature, nonce, expiry (5 minutes), `operator_id`, and `subject_digest` over `approval_id` + subject fields.
2. **Issuers** — Only human entry points mint context: Chat / Wire UI approve buttons (`source: chat_ui | wire_ui`) and `org approval approve` / other CLI human sessions (`source: cli`). `humanApproveOrgApproval` is the helper those paths use.
3. **Non-issuers** — LLM tools, MCP tools, and unauthenticated Dev MCP must not mint or consume context. Dev MCP without a registry token is `chat:read` / `chat:ask` only (`mcp-unauthenticated`).
4. **Single use** — A consumed `context_id` cannot be replayed.
5. **Settlement remains additional** — Tier B/C still require ADR 0037 settlement PassKey. HumanApprovalContext is the session re-confirmation for *all* final approvals; PassKey is the extra high-value gate. Production should keep expanding settlement coverage, not replace this ceremony.

## Consequences

- Direct `approveOrgApproval` without context fails (tests and automation must go through `humanApproveOrgApproval` or an issued context).
- Stored scheduling authority still mints context in-process from the recorded operator; that is a continuation of a prior human click, not an LLM path.
- `ORGOS_HUMAN_APPROVAL_SECRET` should be set in production (doctor / prod-checklist).

## Related

- [0037-dual-passkey-settlement-stepup.md](0037-dual-passkey-settlement-stepup.md)
- `schemas/org/human-approval-context.ts`
- `src/lib/org/human-approval-context.ts`
