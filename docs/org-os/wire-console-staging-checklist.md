# Wire Console — ステージング / 本番 IdP チェックリスト

**Parent:** [wire-console-plan.md](wire-console-plan.md) · [runbook-orgos.md](../runbook-orgos.md) §18

---

## W3-1 ステージング IdP smoke

| # | 確認 | コマンド / 手順 |
|---|------|----------------|
| 1 | OIDC issuer が本番 IdP を指す | `WIRE_CONSOLE_OIDC_ISSUER` |
| 2 | JWKS URL が到達可能 | `curl -sf "$JWKS_URL"` |
| 3 | RS256 id_token で login | `npm run wire-console:test` OIDC cases |
| 4 | Playwright OIDC smoke green | `playwright test e2e/wire-console-oidc.smoke.spec.ts` |

## W3-2 実 passkey（週次 · 手動）

| # | 確認 |
|---|------|
| 1 | `WIRE_CONSOLE_WEBAUTHN_RP_ID` = 本番ホスト |
| 2 | `WIRE_CONSOLE_WEBAUTHN_ORIGIN` = 本番 URL |
| 3 | ハードウェア passkey で login → approve 1 件 |
| 4 | `WIRE_CONSOLE_WEBAUTHN_DISABLE_REGISTER=1`（本番） |

## W3-3 release-check

```bash
npm run wire-console:release-check   # vitest + Playwright smoke 3 本
```

CI: `.github/workflows/validate.yml` job `wire-console-smoke`（末尾で release-check 実行）

## 関連

- TLS Mode A: [production-tls-runbook.md](production-tls-runbook.md)
- Relay SLA: [relay-sla-runbook.md](relay-sla-runbook.md)
