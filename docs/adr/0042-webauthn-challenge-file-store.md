# ADR 0042 — WebAuthn challenge file store

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** Login and registration WebAuthn challenges lived in process memory. Multi-process Operator Console deployments (same host, multiple Node workers) could issue options on one process and verify on another, causing spurious "challenge expired or unknown" failures.

## Decision

1. Persist login and register challenges in `.orgos/webauthn-challenges.json` with 5-minute TTL and one-time consume.
2. Use tmp + rename writes, mode `0600`, and a short-lived `wx` lock file for read-modify-write across processes on one machine.
3. JSON corruption throws `WebAuthnChallengeStoreCorruptError` (fail-closed; no silent empty store).
4. Settlement approval challenges remain in `.orgos/settlement-challenges.json` but adopt the same atomic write / corrupt-throw discipline (ADR 0037).

Redis or cross-host challenge sharing is out of scope; sticky sessions or shared filesystem on one host are sufficient for current deployment.

## Consequences

- Vitest resets challenge store via memory override helpers.
- Production multi-container on one VM: shared `.orgos` volume required for WebAuthn login/register to work across workers.

## Related

- [0041-passkey-bootstrap-token.md](0041-passkey-bootstrap-token.md)
- [0037-dual-passkey-settlement-stepup.md](0037-dual-passkey-settlement-stepup.md)
- `src/lib/wire-console/auth/webauthn-challenge-store.ts`
