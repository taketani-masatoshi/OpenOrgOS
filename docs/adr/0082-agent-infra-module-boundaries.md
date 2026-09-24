# ADR 0082 — Agent infrastructure module boundaries

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** OrgOS maintainers

## Context

Agent runtime code (`src/lib/agent-*.ts`, `aia/`, `llm-pool/`, `mcp/`, `orchestration/`, `pmo/`, `tasks/`, `notifications/`) grew into multi-hundred-line modules with cycles (catalog↔activation, readiness↔pulse) and duplicated helpers. Callers outside Agent infra (~100 files, including finance and steward-chat) must keep stable import paths while internals are split.

Numbers 0079–0081 are reserved by other in-flight branches; this ADR uses **0082**.

## Decision

1. **Layers (dependency arrows point downward only):**
   - `llm_pool` → `catalog` → `roster` → `reporting` → `aia` → `orchestration` → `dispatch` → `verify` → `apps` (mcp / tasks / pmo / notifications / agent-summaries)
2. **Hard rules:**
   - `llm_pool` must not import other Agent-infra modules
   - `aia` must not import `orchestration` or `agent-dispatch`
   - `agent-reporting` must not import `orchestration`
3. **Facades are permanent public API.** Top-level files (`agent-catalog.ts`, `agent-dispatch.ts`, …) and existing directory entry files re-export internals. Split implementations live under `src/lib/agents/<topic>/` and must not be imported from outside Agent infra.
4. **Known cycles remain explicit baselines** until their owners can cut them:
   - `agent-readiness` ↔ `agent-pulse` (pulse out of scope; axis scoring is pure and takes pulse results as args — extract `evaluateAgentPulseChecks` later to finish the cut)
   - `notifications/push` ↔ `steward-chat/today-context` (wait for correspondence-refactor)
   - `agent-summaries` ↔ `dashboard` (wait for finance DashboardReport freeze)
5. **Write-call sites** listed in `canonical-write-baseline` stay in their current files (capability-sync, docs-sync, portability, aia/scheduler, mcp/audit).
6. **Contract tests:** `tests/agent-infra-dependency-direction.test.ts` and CLI surface snapshots for agent / orchestrate / llm / mcp / pmo / executive / notifications.

## Consequences

- Refactors can proceed without rewriting finance / steward-chat import graphs.
- Layer violations cannot grow without updating the baseline deliberately.
- Gated areas (summaries, push, llm-pool) defer until their merge prerequisites land.

## Related

- [0034-llm-worker-pool-routing.md](0034-llm-worker-pool-routing.md)
- [0039-agent-fs-guard.md](0039-agent-fs-guard.md)
- [0040-aia-parallel-runtime.md](0040-aia-parallel-runtime.md)
- [0044-work-order-dag-orchestration.md](0044-work-order-dag-orchestration.md)
- `src/lib/agents/layer-catalog.ts` · `tests/agent-infra-dependency-direction.test.ts`
