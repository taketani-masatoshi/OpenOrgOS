# ADR 0078: Correspondence Hooks Composition Boundary

**Status:** Accepted  
**Date:** 2026-09-24

## Context

Mail outbound / intake and scheduling-coordination share lifecycle side-effects (send, CEO inline answers, style enrichment). Direct static imports from `lib/correspondence` into `lib/scheduling-coordination` created a cycle and blocked independent testing.

A first pass introduced binder hooks and scattered `import "./bind-correspondence-hooks.js"` across ~9 composition leaves. Missing imports caused **silent no-ops** for scheduling side-effects.

## Decision

1. **One-way dependency** — `lib/correspondence` never statically imports `scheduling-coordination`. Scheduling registers handlers via `registerCorrespondenceHooks` / `registerCorrespondenceHooksBinder`.

2. **Single composition entry** — production roots import only  
   `src/lib/composition/register-correspondence-hooks.ts`  
   (CLI `src/cli.ts` · `cli-program.ts` · Steward Chat `server.ts` · scheduling test fixture). Leaf commands and Chat route modules do **not** re-import the binder.

3. **Observability** — `getCorrespondenceHooks()` warns once when no binder is registered (non-test). `ORGOS_REQUIRE_CORRESPONDENCE_HOOKS=1` upgrades the warn to a throw. Contract tests assert composition roots keep the import.

4. **Style-lint enrichment** — scheduling-aware lint fields use `enrichDraftStyleContext` on the hooks object (not `loadSchedulingCase` inside lint). Without the binder, lint still runs with thinner (non-scheduling) context.

5. **CLI SSOT** — canonical commands are `mail outbound …`; `secretary correspondence` / `secretary mail` remain aliases. Skills and specs name the canonical path first.

6. **Accepted debt** — `scheduling-coordination → correspondence` static imports remain numerous by design (scheduling owns the integration). Shrink only when extracting a thinner facade.

## Consequences

- New CLI / HTTP entry points must import the composition module (or call `ensureSchedulingCorrespondenceHooks` from inside scheduling).
- ADR 0063 compose pipeline CLI labels stay aligned with `mail outbound`.
- Finance monthly-close must not assume `buildConsumptionTaxSummary().issues` (summary has no issue list).

## Related

- [0063 Mail Context Compose Pipeline](0063-mail-context-compose-pipeline.md)
- [0071 Executive tasks SSOT](0071-executive-tasks-ssot-secretary-workbench.md)
- Path: `src/lib/composition/register-correspondence-hooks.ts`
- Path: `src/lib/correspondence/hooks.ts`
- Path: `src/lib/scheduling-coordination/bind-correspondence-hooks.ts`
