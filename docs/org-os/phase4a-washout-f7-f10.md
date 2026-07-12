# Phase 4a washout F7–F10 — scope notes (implementation track)

**Date:** 2026-07-12 · **Parent:** Phase 4a Operational Scorecard · [gmail-ship-gate-checklist.md](gmail-ship-gate-checklist.md)

This note isolates **Phase 4a / F1–F11** work from unrelated branch WIP. Do **not** fold routing · audit · demo data · sch-verify trees into Phase 4a commits.

---

## F7 — Unrelated WIP isolation

| Track | Include in Phase 4a PR? | Examples |
|-------|-------------------------|----------|
| email_wire · wire gateway · protocol DID · live verify | **Yes** | `src/lib/protocol/*`, `src/lib/wire-gateway/*`, `tests/wire-*`, `tests/protocol-inbound-*`, `deploy/mal-pilot/env/mal-ship-gate.env.example` |
| Agent catalog · roster · eslint/prettier drive-by | **No** — separate PR | `src/lib/agent-*`, `eslint.config.js`, large `steward/platform/agent/exports/*` |
| sch-verify / demo tenant dumps | **No** | `tenants/sch-verify/**` |
| MAL business CTR / correspondence drafts | **No** (F8) | `tenants/mal/docs/contracts/**`, executive drafts |

Operator action: when opening the Phase 4a PR, stage only the Wire / email_wire / washout paths above.

---

## F8 — OrgOS maturity (CTR / ops) — deferred to business track

Maturity score 85 gaps (draft CTR · ops records) are **CEO / Contract Agent** work, not Wire gate work.

- Do **not** mark CTR executed without human approval.
- Track separately via `orgos control gaps` / Contract Work Orders.
- Wire Operational Scorecard ≥90 does **not** require maturity 100.

---

## F9 — Phase 4b Gmail OAuth readiness (scaffold only)

Deferred per [ADR 0004](../adr/0004-gmail-deferred-opt-in-gate.md).

| Ready now | Still blocked |
|-----------|---------------|
| Checklist § Phase 4b | Google OAuth redirect pair |
| Community `tenant_mail_connect_*: false` | `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1` |
| Steward mail setup CLI scaffold | Live token push E2E |

Do not flip integration flags to `true` until Community E2E passes.

---

## F10 — `ORGOS_EMAIL_WIRE_REQUIRED=1` path (opt-in · not default)

| Artifact | Role |
|----------|------|
| `deploy/mal-pilot/env/mal-ship-gate.env.example` | Commented `ORGOS_EMAIL_WIRE_REQUIRED=1` fragment |
| `scripts/mal-ship-gate-check.sh` | Dry-run prod gate with REQUIRED=1 |
| Checklist CEO § | Human gate before systemd default |

```bash
./scripts/mal-ship-gate-check.sh mal
```

Production default remains **unset** until CEO approval (Phase 5).

## F5 note (Core strict marker)

Full `npm test` on this branch may still fail due to **F7 unrelated WIP** (mal finance/dashboard/yojitsu/agent dumps). Wire / Phase 4a suites below must pass before claiming F1–F4 / F11 done:

```bash
npm run test:phase4a
```

（個別ファイル列挙より `package.json` の `test:phase4a` を正本とする。）

Core 厳格 cap 85 解除は **全件 `npm test` 緑** が条件 — F7 分離後に再実行。

**2026-07-12:** Phase 4a wire suite 緑 · `./scripts/mal-ship-gate-check.sh mal` PASS · live roundtrip PASS（`scratch/wire-live-verify-mal-2026-07-12T04-27-19-857Z.json`）。全件 `npm test` は F7 WIP で未緑（Core 厳格 marker は失敗のまま）。

自己評価ギャップの実装対応: [phase4a-self-eval-remediation.md](phase4a-self-eval-remediation.md)
