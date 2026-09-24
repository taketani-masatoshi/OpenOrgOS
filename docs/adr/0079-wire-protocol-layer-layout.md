# ADR 0079: Wire protocol layer layout

**Status:** Accepted  
**Date:** 2026-09-24

## Context

Wire / protocol code lived mostly as a flat `src/lib/protocol/*.ts` tree plus a 2,400-line `src/commands/protocol.ts`. Facades (`core` / `transport` / `distribution` / `adapters`) existed as re-export barrels only. Cross-imports between `protocol`, `wire`, and `wire-gateway` formed cycles (codec/DNS, gov-gateway deliver, record-transaction bridge re-exports).

## Decision

1. **Physical layers under `src/lib/protocol/`:** `core/`, `transport/`, `distribution/`, `adapters/`, `readiness/`.
2. **Dependency direction (downward only):** commands → readiness → wire-gateway → adapters → distribution → transport → core → schemas. Readiness may depend on any layer; domain layers must not import readiness.
3. **CLI handlers** live in `src/commands/protocol/<domain>.ts`. `src/commands/protocol.ts` remains a thin compatibility re-export. Canonical operator surface is `orgos wire` (`src/cli/registrars/wire.ts`); historical `protocol` / `hub` / `wire-gateway` roots are registered from `src/cli/registrars/protocol/`.
4. **Cycles broken by move + injection:** Wire codec and OpenOrg DNS live in `protocol/transport/`; gov-gateway deliver is passed explicitly via `deliverGovGateway` / `withGovGatewayDeliver`; wire-node governance accepts caller-loaded gateway config.
5. **Contract tests:** `tests/protocol-dependency-direction.test.ts` (baseline must not grow) and `tests/cli-wire-surface-contract.test.ts` (protocol CLI snapshot).

## Consequences

- Importers use layer paths (`src/lib/protocol/transport/...`, etc.). Flat shims were removed after rewrite.
- Large single-file splits (`transport.ts`, `notice-workflow.ts`, gateway `server.ts`) remain follow-up work.
- `orgos protocol` stays as a documented compatibility alias for `orgos wire`.

## Related

- [docs/org-os/memos/00-wire-buffer-layer.md](../org-os/memos/00-wire-buffer-layer.md)
- [0075-wire-demo-walkthrough.md](0075-wire-demo-walkthrough.md)
