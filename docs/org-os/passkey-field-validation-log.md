# Passkey 現場検証ログ

**版:** 1.0 · **日付:** 2026-08-24  
**計画:** [passkey-production-security-plan.md](passkey-production-security-plan.md) Wave 4

本番 HTTPS ホストでの Touch ID / hybrid 登録・ログインは **コード外の運用検証**。vitest Wave 1–2 が自動回帰、本書が現場記録の正本。

## 自動回帰（2026-08-24 記録）

| ケース | 手段 | 結果 |
|--------|------|------|
| origin / RP hash / UP·UV fail-closed | vitest `webauthn-origin.test.ts` 等 | Pass |
| credential store corrupt → 503 | vitest | Pass |
| Secure Cookie when `ORGOS_COOKIE_SECURE=1` | vitest | Pass |
| prod bootstrap token mint/consume | vitest `passkey-bootstrap.test.ts` | Pass |
| Wire Console bootstrap 初回登録 E2E | Playwright `wire-console-webauthn-bootstrap.smoke.spec.ts` | Pass |
| Wire Console PassKey 管理 `/settings/` | wire-console App + shared PasskeySettingsPage | Pass |

## 現場チェック（オペレータ記入）

| # | 項目 | ホスト | 実施日 | 結果 | 担当 |
|---|------|--------|--------|------|------|
| 1 | HTTPS 本番 Origin で初回 login 鍵登録（bootstrap token + SSO） | | | | |
| 2 | 登録後 Touch ID / platform 鍵で再ログイン | | | | |
| 3 | iPhone hybrid 決済鍵（ADR 0037） | | | | |
| 4 | credential ファイル mode 0600 確認 | | | | |
| 5 | `orgos doctor` prod auth checks 全緑 | | | | |

## 関連

- [ADR 0041](../adr/0041-passkey-bootstrap-token.md)
- [ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md)
