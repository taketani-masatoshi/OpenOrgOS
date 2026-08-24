# ADR 0041 — Passkey bootstrap token（本番初回登録）

- **Status:** Accepted
- **Date:** 2026-08-24
- **Supersedes:** 旧ドラフト `0039-passkey-bootstrap-token.md`（0039 は agent-fs-guard に使用済み）

> **番号:** bootstrap token は **0041**。0038 = HumanApprovalContext · 0039 = agent-fs-guard。

## Context

Dual PassKey（ADR 0037）と HumanApprovalContext（ADR 0038）は実装済み。本番初回のログイン鍵登録を SSO セッションだけに頼ると、セッションハイジャック時の鍵植え付けリスクが残る。

## Decision

1. CLI `orgos operator passkey-bootstrap mint --operator-id … --ttl …` が一度だけ平文トークン（`pkb_…`）を出す。
2. 保存は `.orgos/passkey-bootstrap.json` に hash のみ（0600 · atomic）。
3. Production では token 無しの初回 login 鍵登録を拒否。非 production は SSO セッションのみ可。
4. 追加ログイン鍵・決済鍵は現行どおりセッション + identity（token 不要）。

実装: `src/lib/wire-console/auth/passkey-bootstrap.ts` · `webauthn-register-gate.ts` · `webauthn-register.ts`

## Consequences

- `orgos doctor` / prod-checklist: open bootstrap 禁止 · bootstrap token または login credential 必須。
- 現場 HTTPS 検証: [passkey-field-validation-log.md](../org-os/passkey-field-validation-log.md)

## Related

- [0037-dual-passkey-settlement-stepup.md](0037-dual-passkey-settlement-stepup.md)
- [0038-human-approval-context.md](0038-human-approval-context.md)
- [0039-agent-fs-guard.md](0039-agent-fs-guard.md)
- [passkey-production-security-plan.md](../org-os/passkey-production-security-plan.md)
