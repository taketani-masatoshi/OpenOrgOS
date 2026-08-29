# ADR 0059 — Chat answer memory (cloud → local grounding)

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** OrgOS maintainers

## Context

Local LLM workers (Ollama etc.) are slow and less precise than cloud models for Steward / Secretary Chat. Conversation history is trimmed to 5–20 turns, so older high-quality cloud answers disappear. There was no cross-thread reuse of past Q→A pairs.

Community Web only SSO-handoffs into Operator Console; chat SSOT remains tenant `data/chat/threads/*.json`.

## Decision

1. **Tag assistant turns** with optional `source` (`cloud` | `local` | `deterministic` | `unknown`), `model`, `worker_id` when persisting LLM replies.
2. **Derived index** at `tenants/{id}/data/chat/answer-memory/index.json` (gitignored, rebuildable via `orgos chat memory reindex`). Canonical store remains thread JSON.
3. **Index** LLM replies only (not Fact Provider / Command Router / tower deterministic replies). Prefer **cloud** over local/unknown for the same normalized query hash.
4. **Retrieve** before LLM fallback: exact hash, then token Jaccard; inject up to `max_hits` (default 2) into the system prompt as **reference phrasing**. Today / Fact / inbox still win over stale numbers.
5. **Disable** with `ORGOS_CHAT_ANSWER_MEMORY=0` or `chat/settings.json` → `answer_memory.enabled: false`.
6. **No embeddings / vector DB** in v1 — keep dependencies and L2 surface small.

### Follow-up (2026-08-26): Good/Bad feedback + FAQ index

7. **UI feedback** — `POST /chat/v1/feedback` with `turn_id` + `good` | `bad` on assistant messages.
8. **Scoring** — answer-memory entries track `good_count` / `bad_count`; `suppressed` when Bad wins. Bad-rated answers are not retrieved; Good boosts score.
9. **FAQ index** — `data/chat/faq-index/index.json` built from Good-rated, net-positive Q&A. Exact match serves without LLM (`faq_served`). Rebuild: `orgos chat faq build`, settings UI, chat footer, or idle debounce (`ORGOS_CHAT_FAQ_IDLE_MS`, default 5m).
10. **Deploy** — Docker local stack mounts host `apps/steward-chat/dist` and `packages/orgos-cli/dist`. Rebuild with `npm run operator-console:build` + `npm run build:package` (or `start-local-stack.sh` auto-build) or UI/API changes stay invisible.

This does **not** skip the local LLM on memory-only hits (non-FAQ). FAQ exact hits skip LLM.

## Consequences

### Positive

- Cloud phrasing and procedures remain available after thread trim
- Local runs can stay on-device while borrowing prior cloud quality
- Rebuildable index; no second writable SSOT

### Negative / follow-ups

- Extra tokens in the local context window if hits are long (answers clipped to 2000 chars)
- Lexical similarity misses paraphrase-heavy questions (embeddings later if needed)
- Exact-hit “return without LLM” remains optional future work

## Related

- [0033-deterministic-fact-provider-registry.md](0033-deterministic-fact-provider-registry.md)
- [0034-llm-worker-pool-routing.md](0034-llm-worker-pool-routing.md)
- [docs/org-os/chat-answer-memory.md](../org-os/chat-answer-memory.md)
- `src/lib/steward-chat/answer-memory.ts`
