# ADR 0035 — Chat Command Router

- **Status:** Accepted
- **Date:** 2026-07-27

## Context

Cursor-side Steward can run arbitrary `orgos` CLI / Skill / shell actions. WebUI Steward Chat previously executed only a handful of regex pre-handlers and (when enabled) ~9 LLM tools. Local Ollama deployments defaulted tools off, so capability parity with Cursor was poor for “run this specific CLI” requests.

The routing registry (`steward/core/routing/registry.yaml`) and Skill handlers already encode intent→CLI, but Chat did not call them.

## Decision

Add a **deterministic Command Intent Router** that:

1. Extends Skill registry entries with optional `chat: { enabled, kind, permission, label, args }`
2. Resolves chat messages via `matchRoutes` → chat-enabled skills
3. Auto-runs `kind: read`; requires confirmation for `kind: write`; never auto-runs `kind: approval`
4. Reuses `resolveSkillInvocation` / Skill handlers (same path as `orgos skills run`)
5. Exposes HTTP (`/chat/v1/commands/*`), CLI (`orgos commands list|match`), and optional LLM tools (`operator_list_commands`, `operator_run_command`) when `worker.supports_tools` is true

## Consequences

- WebUI can launch the allowlisted CLI/skills accurately without relying on local tool calling quality
- Catalog growth is controlled (`chat.enabled`) and validated by integrity
- Write/approval safety stays behind confirmation / human gates
- Worker `supports_tools` replaces blanket `ORGOS_LLM_TOOLS=0` for Ollama local startup

## Related

- [0033](0033-deterministic-fact-provider-registry.md) — Fact Provider Registry
- [0034](0034-llm-worker-pool-routing.md) — LLM worker pool
- [docs/org-os/chat-command-router.md](../org-os/chat-command-router.md)
