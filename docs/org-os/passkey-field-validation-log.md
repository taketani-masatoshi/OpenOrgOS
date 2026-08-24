# Passkey 現場検証ログ

**版:** 1.2 · **日付:** 2026-08-24  
**計画:** [passkey-production-security-plan.md](passkey-production-security-plan.md) Wave 4

本番 HTTPS ホストでの Touch ID / hybrid 登録・ログインは **コード外の運用検証**。vitest Wave 1–2 が自動回帰、本書が現場記録の正本。

## 自動プリフライト（2026-08-24）

```bash
cd /path/to/OS_Steward
export ORGOS_TENANT=<tenant-id>
npm run passkey:field-check -- --url https://<公開ホスト>
# または
orgos operator passkey-bootstrap field-check --url https://<公開ホスト>
```

| チェック | 内容 |
|----------|------|
| HTTP | `/health` · `/chat/v1/auth/config` · origin/rp_id 整合 |
| ローカル | credential store `0600` · challenge store 読書 |
| doctor | passkey / webauthn / settlement / Secure cookie 関連 |

**手動（オペレータ）:** 下表 #1–#3 · Mac Touch ID · iPhone hybrid · tier B step-up

## 自動回帰（vitest / Playwright）

| ケース | 手段 | 結果 |
|--------|------|------|
| origin / RP hash / UP·UV fail-closed | vitest `webauthn-origin.test.ts` 等 | Pass |
| page-origin 127.0.0.1 → localhost redirect | vitest `webauthn-page-origin.test.ts` | Pass |
| webauthnUserMessage purpose 分岐 | vitest `webauthn-user-error.test.ts` | Pass |
| packed self-attestation 署名 | vitest `webauthn-attestation.test.ts` | Pass |
| credential store corrupt → 503 | vitest | Pass |
| Secure Cookie when `ORGOS_COOKIE_SECURE=1` | vitest | Pass |
| prod bootstrap token mint/consume | vitest `passkey-bootstrap.test.ts` | Pass |
| bootstrap token 再利用 HTTP 403 | vitest `passkey-bootstrap-http.test.ts` | Pass |
| Wire Console prod login E2E | Playwright `wire-console-webauthn.smoke.spec.ts` | Pass |
| Wire Console bootstrap 初回登録 E2E | Playwright `wire-console-webauthn-bootstrap.smoke.spec.ts` | Pass |
| Wire Console 決済 PassKey 登録 E2E | Playwright `wire-console-z-settlement-passkey.smoke.spec.ts` | Pass |
| Wire Console tier B settlement step-up E2E（settings 登録 · 共同承認者 UI · step-up） | Playwright `wire-console-settlement-stepup.smoke.spec.ts` | Pass（2026-08-24 · 4/4 suite） |
| Wire Console PassKey 管理 `/settings/` | wire-console App + shared PasskeySettingsPage | Pass |
| PassKey UI smoke（handoff · steward webauthn · invalid bootstrap） | `npm run passkey:ui-smoke` | Pass |
| settlement register HTTP (Wire) | vitest `wire-console-server.test.ts` | Pass |
| approval message id URL decode | vitest `wire-console-server.test.ts` | Pass |
| settlement challenge route (Wire BFF) | vitest `wire-console-server.test.ts` | Pass |
| FS-guard enforce guarded-write | vitest `fs-guard-guarded-write.test.ts` | Pass |
| credential store mode 0600 | vitest `webauthn-credential-store.test.ts` | Pass |
| challenge store flock/wx ロック | vitest `webauthn-challenge-store.test.ts` | Pass |
| prod auth checklist (wire smoke env) | vitest `passkey-prod-readiness.test.ts` | Pass |
| registry approver 解決 · settlement 登録権限 | vitest `webauthn-register-gate.test.ts` | Pass |
| bootstrap consume 失敗時に credential を残さない（ADR 0041 fail-closed） | vitest `passkey-bootstrap-http.test.ts` | Pass |

CI: `passkey-ui-smoke` job（`.github/workflows/validate.yml`）が `npm run passkey:ui-smoke` を実行し、
prod 系 vitest は `security-rbac` job でも個別に走る。

本番モードの HTTP / checklist テストは `fs_guard_initialized` を満たす必要があるため、
`tests/helpers/fs-guard-store-fixture.ts` の `installFsGuardStoreForTests()` で
一時ディレクトリの FS-guard ストアを登録してから production env に切り替える。

回帰コマンド:

```bash
npx vitest run \
  tests/passkey-bootstrap-http.test.ts \
  tests/passkey-prod-readiness.test.ts \
  tests/webauthn-register-gate.test.ts \
  tests/prod-startup.test.ts \
  tests/prod-auth-checklist.test.ts
```

## 現場チェック（オペレータ記入）

| # | 項目 | ホスト | 実施日 | 結果 | 担当 |
|---|------|--------|--------|------|------|
| 1 | HTTPS 本番 Origin で初回 login 鍵登録（bootstrap token + SSO） | | | | |
| 2 | 登録後 Touch ID / platform 鍵で再ログイン | | | | |
| 3 | iPhone hybrid 決済鍵（ADR 0037） | | | | |
| 4 | credential ファイル mode 0600 確認 | | | | |
| 5 | `orgos doctor` prod auth checks 全緑 | | | | |

## 関連

- [passkey-troubleshooting.md](passkey-troubleshooting.md)
- [settlement-passkey-production-verification.md](settlement-passkey-production-verification.md)
- [ADR 0041](../adr/0041-passkey-bootstrap-token.md)
- [ADR 0042](../adr/0042-webauthn-challenge-file-store.md)
- [ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md)
