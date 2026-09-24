# Agent infra — gated follow-ups (stage 6)

These items are **intentionally deferred** until their merge prerequisites land.
Do not start them on `refactor/agent-infra` without updating this note.

| Area | Blocked on | Work when unblocked |
|------|------------|---------------------|
| `agent-summaries.ts` | Finance refactor freezes `DashboardReport` (via `dashboard.ts`) | Split formatters/writers under `agents/summaries/`; add golden tests; drop unused `prop001`/`prop002` |
| `notifications/push.ts` | `correspondence-refactor` moves `buildTodaySummaryForPush` into `push.ts` | Unify webhook/openwebui send; remove unused `prevUrl`; then fix D (queue event only for `pipeline_daily_complete`) |
| `llm-pool/**` | `codex/console-menu-information-architecture` (model routing / `listWorkerModels`) disposition | API key env priority list; drainQueue cleanup; `withLlmWorker` retry helper; named timing constants; delete unused `llm-pool/index.ts` |

Hand-off for readiness↔pulse cycle: extract `evaluateAgentPulseChecks` from `agent-pulse.ts` so readiness no longer imports pulse (axis scoring already takes pulse results as arguments).
