# ADR 0060 — Local LLM change gates (plan / apply / grades)

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** OrgOS maintainers

## Context

Local LLM workers (Ollama / openai-compatible) reduce cloud cost but increase anxiety about silent edits to company YAML (opened_date, stays, tax, insurance). Steward Chat already returns a **confirmation plan** for write skills via `CommandActionCard`; there was no graded, allow-list change pipeline for hospitality SSOT + derived guest docs.

## Decision

1. **Local LLM does not apply tenant data changes by itself.** Intent JSON → `orgos change plan` → dry-run → human confirm → `orgos change apply`.
2. **Grades A / B / C** gate apply:
   - **A** — opened_date, max_guests, hospitality `sync-derived` (whitelist + marker MD). Confirm card / CLI `--write` OK after dry-run.
   - **B** — yojitsu / lodging tax / stays coupling. Apply requires `--i-understand-grade-b` (human CLI session).
   - **C** — tax-loss design, permit filings, dropping insurance. Plan memo only; **apply forbidden**.
3. **Chat catalog:** `change_plan` (read) · `change_apply` (write → existing confirmation plan). Ask-only paths unchanged. Do not add silent YAML writers.
4. **Integrity lint** (warnings first): stay `check_in` before `opened_date`; tax assessment period before open month; `property-revenue` room_count vs PROP SSOT / room_count>1 plan multiplier warning.
5. **Audit** at `data/operator/change-audit.jsonl` (gitignored) · proposals under `data/operator/change-proposals/`.
6. **Prod** keeps rejecting `ORGOS_LLM_TOOLS_WRITE=1` (doctor).

## Consequences

- Operators can use local models for Q&A and change *proposals* without trusting them to mutate SSOT.
- mal may show validate **warnings** for pre-open demo stays until a separate Work Order cancels/adjusts them.
- Grade B auto-rewrite of yojitsu/tax remains out of scope (separate request).

## Related

- [operator-policy.md](../../steward/rules/operator-policy.md) §4.1a
- [tool-neutral-development.md](../../steward/rules/tool-neutral-development.md) §2.7
- [0035-chat-command-router.md](0035-chat-command-router.md)
- [0034-llm-worker-pool-routing.md](0034-llm-worker-pool-routing.md)
