# Community tenant-mail connect (Option B)

> **ステータス: 実装済 · 既定は未出荷**  
> API / Connections UI は存在する。`COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED` が無いとき Community は 503。本番ゲート・`community-integration.json` の `tenant_mail_connect_*: false` は CEO 出荷まで維持。  
> ライブ pilot 時は `ORGOS_EMAIL_WIRE_REQUIRED=1` と mail-config / OAuth 設定後に Phase 4 を実行。  
> 出荷チェックリスト: [gmail-ship-gate-checklist.md](gmail-ship-gate-checklist.md)

Community ログイン後に Gmail を連携し、OAuth トークンを OrgOS Steward テナント workspace へ push するフロー（**将来出荷**）。

## 前提

| コンポーネント | 必須 env |
|---|---|
| **Steward** | `ORGOS_GMAIL_CLIENT_ID` / `ORGOS_GMAIL_CLIENT_SECRET`（Community と **同一** Google OAuth client） |
| **Steward** | `ORGOS_COMMUNITY_GOVERNANCE_TOKEN`（Community と同一 Bearer） |
| **Community** | `AUTH_GOOGLE_*` または `ORGOS_GMAIL_*` |
| **Community** | `STEWARD_API_URL` または `ORGOS_STEWARD_PROTOCOL_URL` |
| **Community** | `AUTH_SECRET`（本番必須 — OAuth state 署名） |

Google Cloud Console redirect URI（2 本）:

- `https://community.oorgos.org/api/auth/callback/google`（ログイン）
- `https://community.oorgos.org/api/integrations/orgos-mail/callback`（Gmail 連携）

## 手順

### 1. Steward protocol API 起動

```bash
cd /Users/kk/OS_Steward
export ORGOS_COMMUNITY_GOVERNANCE_TOKEN=your-shared-secret
export ORGOS_GMAIL_CLIENT_ID=...
export ORGOS_GMAIL_CLIENT_SECRET=...
# protocol API（例: port 9476）
npm run orgos -- protocol api serve
```

### 2. Community 連携 URL 発行

```bash
export ORGOS_TENANT=mal
export ORGOS_COMMUNITY_URL=https://community.oorgos.org
npm run orgos -- mail setup gmail --community-link \
  --expect-email k.lab.masa@gmail.com \
  --json
```

`connect_url` をブラウザで開く（Community に Google ログイン済みであること）。

### 3. 確認

Steward 側:

- `tenants/mal/records/executive/gmail-oauth.json` — `connected_via: "community"`
- `tenants/mal/records/executive/mail-config.yaml` — `provider: gmail_api`
- `tenants/mal/data/protocol/community-gmail-bind.yaml` — nonce が consumed

### 4. 送信 smoke

承認済み下書きを Gmail API で送信:

```bash
ORGOS_TENANT=mal npm run orgos -- secretary correspondence send --draft DRAFT-...
```

## API（Steward）

| Method | Path | Auth |
|---|---|---|
| GET | `/protocol/v1/community/tenant-mail/bind?tenant_id&nonce` | なし |
| POST | `/protocol/v1/community/tenant-mail/bind` | Bearer governance |
| POST | `/protocol/v1/community/tenant-mail/gmail-token` | Bearer governance |

Catalog: `publish/protocol/community-tenant-mail-api.json`

## セキュリティ

- nonce は **30 分 TTL · 1 回限り**（`claimCommunityGmailBind`）
- `--expect-email` で Community ログインメールを bind 発行時に固定可能
- Community は refresh token を DB に保存しない — Steward L2 のみ
- OAuth client ID は push 時に Steward 側で検証（不一致は 422）

## SMTP / IMAP の秘密（Gmail API を使わない場合）

Gmail OAuth を使わないテナントは、SMTP / IMAP の資格情報を **env に書かずに Console から保存できる**。

| 面 | 経路 |
|---|---|
| Console | 会社の設定 → メール → 「SMTP / IMAP の秘密」 |
| BFF | `PUT /chat/v1/mail/secrets`（`chat:approve` · 保存のみ） |
| 状態 | `GET /chat/v1/mail/gmail` の `secrets`（boolean とマスク済み hint のみ） |

- 保存先は `tenants/{id}/data/secrets/mail-secrets.env`（gitignore · mode 0600）。実装は Stripe と共通の `src/lib/secrets/env-file-store.ts`。
- **deploy の env が優先**。ストアは env が空のときだけ `process.env` を埋める（`hydrateMailEnvFromStore`）。
- 生値は API レスポンスにもチャットにも出さない。既存の `records/executive/imap.env` は読取フォールバックとして残る。
- データ分類上は L2 — [data-classification](../../.cursor/rules/data-classification.mdc) のとおり tracked ファイルに値を書かない。ファイルは gitignore 済み。

## 関連

- [google-oauth-setup.md](../../OS_Community/docs/google-oauth-setup.md)（Community OAuth redirect）
- `src/lib/protocol/community-tenant-mail-api.ts`
- `src/lib/protocol/community-gmail-bind.ts`
