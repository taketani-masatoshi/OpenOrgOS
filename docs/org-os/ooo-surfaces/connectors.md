# 外部連携の面（OOO-54〜OOO-57）

**実装:** `src/lib/steward-chat/routes/integrations-api.ts` ·
`src/lib/integrations/{connector-store,connector-hub,slack-connector,asana-adapter,gdrive-export}.ts` ·
`src/lib/protocol/{community-connector-bind,community-connectors-api}.ts`
**採点:** `docs/org-os/ooo-capability-items.yaml` の OOO-54〜OOO-57

Slack · Asana · Gmail · Google Drive をコンソールから接続し、社外へ出す面。
**正本は OrgOS の YAML / MD** のままで、外部サービスに置くものは L1 の写しに限る。
OAuth は Community が仲介し、トークンは gitignore 下のテナント records に入る。

## 経路と必要権限

| 経路 | 権限 | 用途 |
|---|---|---|
| `GET /chat/v1/integrations` | `chat:read` | 接続状態・既定の送り先（秘密なし） |
| `POST /chat/v1/integrations/:provider/connect` | `chat:approve` | bind 発行と Community 接続 URL |
| `POST /chat/v1/integrations/:provider/disconnect` | `chat:approve` | トークン削除 |
| `PUT /chat/v1/integrations/:provider/settings` | `chat:approve` | 既定チャンネル / プロジェクト / フォルダ |
| `PUT /chat/v1/integrations/secrets` | `chat:approve` | Slack Webhook · Asana PAT の投入 |
| `POST /chat/v1/integrations/slack/send` | `chat:approve` | Slack 投稿（OOO-55） |
| `POST /chat/v1/integrations/asana/push` | `chat:approve` | WO / 社長タスクの複製（OOO-56） |
| `POST /chat/v1/integrations/gdrive/export` | `chat:approve` | PDF 生成と格納（OOO-57） |
| `GET /chat/v1/integrations/gdrive/exports` | `chat:read` | 正本と Drive ファイルの対応台帳 |

読むのは `chat:read`。**外へ出る操作と、外へ出る先を決める操作は全部 `chat:approve`**。
LLM / MCP は接続も送信も実行しない。

Community 側（governance Bearer + bind nonce の二重）:

| 経路 | 認証 |
|---|---|
| `GET /protocol/v1/community/connectors/bind` | なし（nonce 検証のみ） |
| `POST /protocol/v1/community/connectors/bind` | `ORGOS_COMMUNITY_GOVERNANCE_TOKEN` |
| `POST /protocol/v1/community/connectors/token` | `ORGOS_COMMUNITY_GOVERNANCE_TOKEN` |

## 拒否する条件

| 状況 | 応答 |
|---|---|
| セッションが無い | 401 `unauthorized` |
| 承認権の無い席が接続・送信 | 403 `forbidden` |
| プロバイダが未出荷（Community フラグなし） | 403。`platform_ready: false` を返して接続させない |
| 未接続のまま送信・push・格納 | 422。フォールバックも無ければ外へ出さない |
| 送信先（チャンネル / プロジェクト / フォルダ）が未設定 | 422。宛先の無い送信はしない |
| bind nonce が未発行・使用済み・期限切れ | 422。トークン push を受け付けない |
| bind の対象外メールで Community が押してきた | 422 `not authorized for this tenant bind` |
| Gmail トークンを汎用 connectors 経路へ push | 422。mail-config も書く tenant-mail 経路のみ |
| 許可リスト外のパスを Drive へ出す | 422。`data/**` YAML と L2 は出さない |
| 秘密の GET | 経路が無い。**投入はできるが取り出せない** |
| 想定外の例外 | catch して JSON |

## 正本とレプリカ

- 書き込み正本は OrgOS の YAML / MD。Asana の status も Drive の PDF も戻さない。
- Asana へ出すのは id・件名・状態・期限だけ（`buildAsanaTargetPayload`）。メール本文・金額・住所は入れない。
- Drive へ出せるのは人が読む文書（`docs/company` · `docs/compliance` · `docs/reports` の一部）と
  領収書・Work Order 要約・社長タスク一覧のみ。`assertDocumentExportAllowed` が許可リスト外を弾く。
- 対応台帳は `data/integrations/gdrive-exports.yaml`（正本パスと Drive ファイル ID。秘密なし）。

## 秘密の扱い

OAuth トークンは `tenants/{id}/records/integrations/{provider}-oauth.json`（0600 · gitignore）。
Slack Webhook と Asana PAT は `data/secrets/connector-secrets.env`（0600 · gitignore）。
どちらも読み出す API を持たず、画面には「設定済み / 未設定」とマスクした断片しか出さない（L2）。

## やらないこと

- Slack Events API での双方向同期、Asana Webhook から OrgOS を書き換えること
- Drive の全ファイル同期、YAML の Drive ホスティング
- LLM / MCP による接続・送信・格納
- Direct HTTP / OData（財務 L1）は [ADR 0071](../../adr/0071-direct-http-outbound-connectors.md) — Community OAuth 外の別区画

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/connector-store.test.ts` · `tests/connector-bind.test.ts` · `tests/gdrive-export-allowlist.test.ts` · `tests/asana-target-payload.test.ts` |
| HTTP | `tests/steward-chat-integrations-http.test.ts` |
| E2E | `e2e/steward-chat.integrations.spec.ts` · `apps/web/e2e/orgos-connectors.spec.ts`（Community） |
