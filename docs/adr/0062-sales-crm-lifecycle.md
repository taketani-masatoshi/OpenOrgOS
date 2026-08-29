# ADR 0062: Sales CRM Lifecycle (Wave 2)

**Status:** Accepted  
**Date:** 2026-08-28

## Context

ADR 0047 established the sales line deterministic **read** stack. CRM write paths (deal mutations, Gmail thread linking, quotes, handoff, audit) and Operator Console wave 2 were deferred.

Prospect and customer accounts were split (`party` on deals vs `CUST` in CS). Duplicate prevention, lost reasons, and stage transition rules were undocumented-only.

## Decision

1. **Unified customer SoT** — extend `data/customers/accounts.yaml` with `lifecycle: prospect | customer` and optional `email_domains`. Add `data/customers/contacts.yaml` (`CONTACT-YYYY-NNN`). CS views filter `lifecycle: customer` only.

2. **Deal enrichment** — `account_id`, thread refs, quotes, scheduling, `lost_reason`, `lead_class` / `confidence_pct` on `schemas/sales.ts`. Embedded `party` deprecated after migration.

3. **Mutation stack** — pure domain functions in `src/lib/sales-*` + `saveSalesPipeline` / `saveCustomerAccounts` / `saveCustomerContacts`. CLI and Console POST call the same functions.

4. **Stage machine** — forward-open transitions; `lost` requires `lost_reason`; `won` requires `amount_man`; terminal reopen requires human approval.

5. **Gmail linking** — persist `threadId` on receive; populate triage `mail_thread_ids`; auto-link to INQ/DEAL when unambiguous (no auto deal creation).

6. **Quotes & handoff** — `data/sales/quotes.yaml`; `handoff-won` promotes prospect → customer; no auto `CTR-` creation.

7. **Audit** — extend `auditEventTypeSchema` with `sales_*` events; all mutations append to `audit.jsonl` (no L2 in detail).

8. **Console wave 2** — POST on `/chat/v1/customers/*`; pipeline and accounts sub-nav.

## Consequences

- `orgos sales migrate-accounts` required once per tenant with legacy `party`-only deals
- `orgos validate` gains sales dedupe and FK checks
- LLM / MCP remain read + draft; send and won handoff stay human-gated

### Wave 2b 仕上げ（2026-08-28）

- mal に `migrate-accounts` 適用済み（オープン商談に `account_id`）
- CLI 追加: `deal update` · `inquiry-set-status` · `follow-up-from-sent` · `account merge` · `mail-link-resolve`
- intake: 同一 `gmail_thread_id` の二重 INQ skip
- SCH `sales_demo` confirmed → DEAL `next_action` / `scheduling_case_id` 更新（新スケジューラなし）
- Console Workbench: pipeline ステージ/失注/next_action · inbound 商談化 · outbound→pipeline 誘導 · merge/resolve は CLI のみ
- Vitest: mail-link / quote-handoff / follow-up-merge / inquiry-stage / customers-api L2 非露出

### Console POST vs 意図的 CLI-only（DoD #2）

同一ドメイン関数を呼ぶ。Console に破壊的 UI を置かない操作は **CLI-only** と明示する。

| 面 | Mutations |
|----|-----------|
| **Console POST** | `POST …/deals/set-stage` · `…/deals/set-next-action` · `…/inquiry/promote` |
| **CLI-only（意図的）** | `account merge` · `mail-link-resolve` · `follow-up-from-sent` · `handoff-won` · `deal create` · `deal update` · `quote *` · `demo open` · `classify --apply` · `inquiry-set-status` · `mail-link`（一括） · `draft *` |
| **権限** | オープン間ステージ / next_action / promote = `chat:ask` · won / reopen = `chat:approve` · merge = `chat:approve`（CLI） |

再現手順の正本: [sales-crm-runbook.md](../org-os/sales-crm-runbook.md)

## Related

- [0047 Sales Line Deterministic Stack](0047-sales-line-deterministic-stack.md)
- [0049 Inbound Inquiry Intake](0049-inbound-inquiry-intake.md)
- [0050 Customer Success Deterministic Stack](0050-customer-success-deterministic-stack.md)
- [schemas/sales.ts](../../schemas/sales.ts)
- [schemas/customer-success/accounts.ts](../../schemas/customer-success/accounts.ts)
- [sales-pipeline-spec.md](../org-os/sales-pipeline-spec.md)
- [sales-inbound-spec.md](../org-os/sales-inbound-spec.md)
- [sales-crm-runbook.md](../org-os/sales-crm-runbook.md)
