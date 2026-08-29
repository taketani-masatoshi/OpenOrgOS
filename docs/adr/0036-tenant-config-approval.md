# ADR 0036: Tenant config approval (modules / standards)

- **Status:** Accepted
- **Date:** 2026-07-28

## Context

Steward Chat could not enable ISO standards (e.g. ISMS / ISO-27001) or business modules through a CEO approval gate. Changes required hand-editing `standards.yaml` / `modules.yaml`. Org approval already existed for wire, correspondence, expense, and budget — not for tenant config toggles.

## Decision

1. Introduce `subject_type: tenant.config` with change tickets in `data/org/config-change-requests.yaml` (`CFG-…`).
2. **Propose** (Steward / `chat:ask`) creates the ticket + pending org approval; does not mutate YAML.
3. **Approve** requires `ceo`/`approver`, preview review, and `reviewed=true`; then applies YAML + `sync-context` (modules enable uses `activateTenantModule`; disable is flag-only).
4. CEO inbox `/approvals/` surfaces pending `tenant.config` (and other org approvals) with diff + Approve/Reject. Steward Chat does not host the queue. `tenant.config` may be confirmed by the same CEO who proposed the toggle (inbox confirmation, not a second person).
5. Arbitrary YAML paths remain out of scope — only `enabled` on known standards/modules ids, **agent roster enable**, and **module catalog import+enable** (`action: import_enable`).

## Consequences

- ISMS and module enablement become CEO-gated from WebUI.
- Manual YAML edit remains valid.
- **Apply side-effects:** enable runs `activateTenantModule` + roster/`sync-context`; disable is flag-only (does not uninstall module data).
- Chat approval may require settlement PassKey when amount/tier rules apply (ADR 0037) in addition to HumanApprovalContext (ADR 0038).
- CLI: `orgos tenant-config propose|preview|approve|list`（dev のみ `apply` · prod 拒否）.
- Regulations bind UI is deferred (V2).

## Implementation paths

| 役割 | パス |
|------|------|
| Domain | `src/lib/org/tenant-config-change.ts` |
| Schema | `schemas/org/tenant-config-change.ts` |
| CLI | `src/commands/tenant-config.ts` |
| Chat intent / UI | `tenant-config-intent.ts` · `ApprovalsQueue.tsx` (`/approvals/`) |
| Skill | `tenant_config_propose`（write） |

## Related

- [chat-command-router.md](../org-os/chat-command-router.md)
- [0038-human-approval-context.md](0038-human-approval-context.md)
