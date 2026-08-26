# ADR 0037 — Dual PassKey settlement step-up

- **Status:** Accepted（2026-08-21 改訂: セレモニーはコンソール origin）
- **Date:** 2026-08-17
- **Context:** Session cookies after WebAuthn login carry full operator RBAC. High-value approvals (REG-004 tier B/C) must not rely on session possession alone (unlocked Mac, XSS). Operators want Mac Touch ID for login and a separate iPhone PassKey (browser hybrid QR) for settlement.

## Context

- Login WebAuthn issues an HttpOnly session; subsequent Chat / Wire approve calls use that session.
- JP wire-governance already maps amounts to tiers A/B/C (`approval-thresholds.yaml`).
- Receipt QR (`approve` on a different host) remains a separate pattern for invoice claim (ADR 0032) and must not be mixed with PassKey ceremonies.

## Decision

1. **Credential purpose** — Each stored WebAuthn credential has `purpose: login | settlement` (missing → `login` for compatibility). Optional `rp_id` and `authenticator_attachment`.
2. **Login** — Options list only `purpose=login` credentials for the console RP ID. Prefer `authenticatorAttachment: "platform"` (Mac Touch ID). Settlement credentials never mint sessions.
3. **Single console RP** — Login and settlement credentials share `WIRE_CONSOLE_WEBAUTHN_RP_ID` (local: `localhost` only — IP addresses are not valid RP IDs per WebAuthn; production: public HTTPS host). Settlement uses `hints: ["hybrid"]` / `authenticatorAttachment: "cross-platform"` so Chrome / Safari show the standard PassKey QR (Google Password Manager / iCloud). Do not render a custom URL QR for the ceremony. Do not use a separate approve RP for WebAuthn.
4. **Assurance by tier** — When jurisdiction tier is **B or C** (amount-based), or when `tenant.config` is a **capability increase** (agent enable, module On/import_enable, standards On), `approveOrgApproval` / Chat approve / Wire approve require a verified settlement WebAuthn assertion **in addition to** HumanApprovalContext (ADR 0038). Other tier **A** amount-less disables (module/standards Off) still require HumanApprovalContext only.
5. **Challenge** — Mac session creates a short-lived one-time challenge. The **same console page** runs `credentials.get` (hybrid). API verifies `clientData.origin` against `WIRE_CONSOLE_WEBAUTHN_ORIGIN`, then marks the challenge completed. `qr_url` is deprecated (help only).
6. **Audit** — `OperatorAttestation` may include `settlement_credential_id`, `settlement_challenge_id`, `settlement_rp_id` (no account numbers).
7. **Bypass** — `ORGOS_SETTLEMENT_STEPUP=0` disables the gate for local/dev only; production doctor rejects that misconfig.

## Consequences

- B/C approvals need Bluetooth proximity between Mac and iPhone for hybrid transport.
- Settlement keys must be registered from the console origin (Phase 1), not from a separate approve host.
- Broker `--write` for B/C amounts requires a prior approved org approval with settlement assurance (instruction file only; no bank API).
- Tests use fixture assertions (`WIRE_CONSOLE_WEBAUTHN_TEST_SECRET` pattern) for settlement complete.
- Static `sites/approve` is help-only (not a ceremony origin).

## Related

- [org-approval-schema.md](../org-os/org-approval-schema.md)
- [operator-production.md](../operator-production.md)
- `src/lib/org/settlement-stepup.ts`
- [passkey-iphone-qr-implementation-plan.md](../org-os/passkey-iphone-qr-implementation-plan.md)
- [passkey-production-security-plan.md](../org-os/passkey-production-security-plan.md) — 本番ゲート残件（origin / RP hash / bootstrap token）
- `schemas/org/settlement-stepup.ts`
- [0038-human-approval-context.md](0038-human-approval-context.md) — 全最終承認の人間セレモニー
