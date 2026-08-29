# ADR 0063: Mail Context Compose Pipeline

**Status:** Accepted  
**Date:** 2026-08-28

## Context

Mail Intake / Outbound already supports receive → triage → handoff → human-approved send. Operators need a pipeline where **CLI gathers facts**, **LLM drafts prose from those facts only**, and **OOO validates execution** before humans approve send.

ADR 0062 deferred Gmail thread linking and CRM write paths. Sales inquiries (`INQ-*`) exist but reply generation is manual (`--body`). Style-lint exists but is not wired into the send gate.

Asana is useful for external stakeholder visibility but must not become the case SoT.

## Decision

1. **Three layers**
   - **LLM** — flexible wording from an injected fact pack only; no invented amounts, delivery dates, or inventory.
   - **CLI** — deterministic fact verification (`facts verify`, `knowledge search`) and thread assembly.
   - **OOO** — style-lint, claims match, recipient registry, attachment allowlist, human approval, send.

2. **Case SoT** — OrgOS YAML: `INQ-*`, `DEAL-*`, `SCH-*`. Drafts carry `inquiry_id` / `deal_id` / scheduling notes.

3. **Gmail threads** — persist `gmail_thread_id` on triage; fetch thread history via Gmail API; link unambiguous threads to INQ/DEAL (no auto deal creation).

4. **Compose CLI** — `orgos mail outbound compose` builds fact pack → LLM JSON draft → `createCorrespondenceDraft` + approval proposal. Never sends.

5. **Send gate** — after human approval, enforce `assertCorrespondenceStyleLint`, `assertCorrespondenceClaims`, recipient registry, attachment allowlist; MIME multipart for allowed attachments.

6. **Post-send** — update inquiry/deal/scheduling status and `next_action_due`; optional Asana replica push (L1 fields only).

7. **Asana replica** — `data/integrations/asana-links.yaml` (L1 task gid map); PAT in L2 gitignore. Push/pull never overwrites OrgOS status from Asana. No L2 in Asana payloads.

8. **Agents / MCP** — draft and plan only; no `correspondence send` or `org approval approve`.

## Consequences

- Scheduling mail remains template + lint (not LLM-compose).
- Tenants without retail module get `inventory: unverified` in fact pack.
- `orgos validate` may warn on orphan compose claims in tests.

## Related

- [0062 Sales CRM Lifecycle](0062-sales-crm-lifecycle.md)
- [0049 Inbound Inquiry Intake](0049-inbound-inquiry-intake.md)
- [steward/core/correspondence/style-contract.md](../../steward/core/correspondence/style-contract.md)
- [sales-inbound-spec.md](../org-os/sales-inbound-spec.md)
