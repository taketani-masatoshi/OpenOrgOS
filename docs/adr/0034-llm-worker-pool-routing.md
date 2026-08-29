# ADR 0034 — LLM Worker Pool + local-first routing

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** OrgOS maintainers

## Context

Operator Console LLM calls used a single env target (`getLlmApiConfig()`). Local Ollama / LM Studio cannot absorb concurrent secretary + steward + mail jobs, and cloud APIs (OpenAI / Anthropic) need a controlled overflow path — not a permanent default.

API keys are L2 and must not live in tracked YAML.

## Decision

1. **Registry** — `tenants/{id}/data/llm/workers.yaml` (`orgos.llm.workers.v1`) lists workers (local / cloud), models, `max_inflight`, and **`api_key_env` names only**.
2. **In-process pool** — `src/lib/llm-pool/` leases workers with FIFO queue, least-inflight local preference, optional cloud overflow after `wait_threshold_ms`, and unhealthy cooldown + one retry.
3. **Lease scope** — one lease covers the full tool-loop (all rounds + structured pass) so a conversation stays on one model.
4. **UI** — `/llm-workers/` settings page (`llm:admin` to write). Keys are never accepted or returned by HTTP.
5. **Compat** — missing YAML falls back to a synthetic worker from legacy env config.
6. **Per-request hint** — secretary / steward chat may send `llm_route` (`auto` | `local` | `cloud`, optional `worker_id`). Explicit local/cloud/pin does not overflow or fall back to another tier.

## Consequences

### Positive

- Multiple Mac mini Ollama endpoints scale via registry rows
- Cloud spend only when local queue is backed up (toggle)
- Env remains the secret store (classification-safe)

### Negative / follow-ups

- Pool is per Console process (no cross-host dispatcher yet)
- Anthropic probe is key-presence only (no cheap health endpoint)
