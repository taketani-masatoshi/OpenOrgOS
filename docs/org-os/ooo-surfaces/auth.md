# 認証の面（OOO-01〜OOO-03）

**実装:** `src/lib/steward-chat/auth.ts` · `src/lib/steward-chat/routes/settlement-api.ts` ·
`src/lib/console-auth/operator-rbac.ts` · `src/lib/org/ooo-login-email.ts`
**採点:** `docs/org-os/ooo-capability-items.yaml` の OOO-01〜OOO-03

会社の根幹に入る鍵は3種類ある。**本鍵**（会社ドメインの Community SSO）、
**第2鍵**（ログイン PassKey・operator あたり最大2台）、
**決済鍵**（Settlement PassKey・承認専用でログイン復旧には使わない）。

## 経路と必要権限

| 経路 | 権限 | 用途 |
|---|---|---|
| `POST /chat/v1/auth/login` | 不要（これが入口） | Community SSO のトークンを席に結ぶ |
| `GET /chat/v1/auth/me` | セッション | 名乗っている席を返す |
| `POST /chat/v1/auth/logout` | セッション | 席を離れる |
| `POST /chat/v1/settlement/challenge` | `chat:approve` | 決済 step-up の儀式を開く |
| `POST /chat/v1/settlement/complete` | チャレンジトークン | 儀式を閉じて承認を確定する |
| `POST /chat/v1/settlement/enroll` | セッション | 決済 PassKey を登録する |

決済 step-up は承認の前半なので、セッションではなく `chat:approve` を要求する。
読み取りだけの席が金の儀式を開始できてはいけない。

## 拒否する条件

| 状況 | 応答 |
|---|---|
| セッションが無い | 401 `unauthorized` |
| 承認権限の無い席が儀式を開く | 403 `forbidden` |
| `approval_id` が無い | 422 `approval_id required` |
| 承認が存在しない | 404 `approval not found` |
| step-up 不要な承認（tier A・金額なし） | 400 `does not require settlement step-up` |
| WebAuthn 登録が無効な環境 | 403 `WebAuthn registration disabled` |
| 署名検証の失敗・期限切れ | 401 / 400。チャレンジは使い捨て |
| 名簿外のメール・他ドメイン | ログイン拒否（`login_policy`） |
| 本番で registry が空 | 起動拒否（`orgos doctor`） |

## ドメインと席

SSO のメールは `operators.yaml` の `login_policy.email_domains` に属していなければ
ならない。例外は創業者1席（`grandfather_emails`）と期限付きゲストのみで、
そのどちらも新規に増やせない。詳細は
[operator-policy](../../steward/rules/operator-policy.md) §4.2。

## やらないこと

- パスワード認証。復旧経路も含めて持たない
- 決済 PassKey によるログイン復旧。決済鍵は承認だけに使う
- LLM / MCP からの承認実行。儀式は人間セッションからしか開けない

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/ooo-login-email.test.ts` · `tests/operator-rbac.test.ts` · `tests/settlement-stepup.test.ts` |
| HTTP | `tests/steward-chat-platform-tenant-http.test.ts` · `tests/steward-chat-settlement-http.test.ts` |
| E2E | `e2e/steward-chat.product.spec.ts` · `e2e/steward-chat-webauthn.smoke.spec.ts` · `e2e/wire-console-settlement-stepup.smoke.spec.ts` |
