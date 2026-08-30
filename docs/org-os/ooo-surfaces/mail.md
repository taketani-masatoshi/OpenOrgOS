# 通信の面（OOO-29〜OOO-36）

**実装:** `src/lib/steward-chat/routes/correspondence-api.ts` · `platform-api.ts` ·
`src/lib/correspondence/`
**採点:** `docs/org-os/ooo-capability-items.yaml` の OOO-29〜OOO-36

会社の名前で外へ出る面。下書きは AI が作ってよいが、**送信は人間の承認を経る**。
設定に入る資格情報は入れられても取り出せない。

## 経路と必要権限

| 経路 | 権限 | 用途 |
|---|---|---|
| `GET /chat/v1/correspondence/pending` | `chat:read` | 承認待ちの下書き |
| `POST /chat/v1/correspondence/send` | `chat:approve` | 承認後の SMTP / Slack 送信 |
| `GET /chat/v1/mail/gmail` | `chat:read` | Gmail 連携の状態 |
| `POST /chat/v1/mail/gmail/connect` | `chat:approve` | Gmail 連携の開始 |
| `POST /chat/v1/mail/gmail/disconnect` | `chat:approve` | 連携の解除 |
| `PUT /chat/v1/mail/config` | `chat:approve` | 送信元名・アドレス・provider |
| `PUT /chat/v1/mail/secrets` | `chat:approve` | SMTP / IMAP パスワードの投入 |
| `GET /chat/v1/platform/integration` | `chat:read` + platform operator | 既定出荷フラグの宣言 |
| `PUT /chat/v1/platform/integration` | platform operator | フラグの切替 |

読むのは `chat:read`。**外へ出す設定を触るものは全部 `chat:approve`** に寄せてある。
送信元の名乗りを変えることは、送信そのものと同じ重さで扱う。

## 拒否する条件

| 状況 | 応答 |
|---|---|
| セッションが無い | 401 `unauthorized` |
| 承認権の無い席が送信・設定変更 | 403 `forbidden` |
| 未承認の下書きを送ろうとする | 拒否。承認ゲートを通っていない下書きは送らない |
| OOO（不在）ゲートに当たる宛先 | 保留。黙って送らない |
| provider が未設定のまま送信 | 422。宛先も送信元も無いまま送らない |
| `GET /chat/v1/mail/secrets` | 返さない。**投入はできるが取り出せない** |
| Gmail 連携が SHIPPED ゲート外 | 403。opt-in のテナントだけ |
| プラットフォーム運用者でない席がフラグ切替 | 403 |
| 想定外の例外 | catch して JSON |

## 秘密の扱い

SMTP / IMAP のパスワードと Gmail のトークンは gitignore 下の secrets store に入り、
**読み出す API を持たない**。設定画面は「設定済み / 未設定」しか表示せず、
HTTP 応答にもチャットにも値は出さない（L2）。E2E はマスクされていることを見る。

## やらないこと

- AI による無承認送信。下書きと宛先の提案まで
- 受信のポーリング常駐。取り込みは明示の実行
- L2 本文をチャットに転記すること

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/correspondence-ooo-gate.test.ts` · `tests/correspondence-human-approval-gate.test.ts` · `tests/mail-secrets-store.test.ts` |
| HTTP | `tests/steward-chat-correspondence-http.test.ts` · `tests/steward-chat-mail-secrets-api.test.ts` · `tests/steward-chat-platform-tenant-http.test.ts` |
| E2E | `e2e/steward-chat.mail.spec.ts` · `e2e/steward-chat.product.spec.ts` |
