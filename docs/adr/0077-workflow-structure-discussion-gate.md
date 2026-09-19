# ADR 0077 — Workflow structure discussion gate

- **Status:** Accepted
- **Date:** 2026-09-17
- **Deciders:** OrgOS maintainers

## Context

Operator Console gained a React Flow WorkflowCanvas for AIA / module / task graphs. Treating the canvas as a silent SSOT editor would violate OpenOrgOS change gates (ADR 0060, org-chart OCH). Operators still need a UI to **discuss** structure with optional LLM evaluation.

## Decision

1. **Canvas is a discussion surface**, not SSOT. Roles must not mix: canonical / draft / proposed / recorded.
2. **SSOT** lives at `tenants/{id}/data/org/workflows/{workflow_id}.yaml` (L1, no personal names).
3. **Evaluate first (deterministic):** Zod, edge integrity, agent/module id checks, minimal repair proposal. Optional LLM overlay is parse-only; never writes YAML.
4. **Propose → APR → validate → apply** mirrors OCH:
   - Proposals: `data/org/workflow-changes/WFS-YYYYMMDD-NNN.yaml`
   - Approval `subject_type`: `workflow.structure`
   - Apply requires approved APR + `chat:approve`; grade C is plan-only
5. **Do not reuse** hospitality `change_plan` / `change_apply` (different whitelist domain).
6. Chat skill `workflow_evaluate` is **read-only**. No apply Chat skill.

## Consequences

- Operators can iterate graphs in Console without mutating company YAML.
- Same human approval queue as org chart / correspondence.
- LLM cannot become the apply path; local ERROR fallback stays intact.

## Related

- [0060-local-llm-change-gates.md](0060-local-llm-change-gates.md)
- [docs/org-os/org-chart.md](../org-os/org-chart.md)
- [docs/org-os/workflow-canvas.md](../org-os/workflow-canvas.md)
- [operator-policy.md](../../steward/rules/operator-policy.md) §4.1a
