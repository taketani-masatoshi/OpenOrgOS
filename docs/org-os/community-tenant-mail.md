# Community tenant-mail connect (Option B)

> **ステータス: 未出荷（scaffold only）**  
> Gmail / Community 連携 UI はコード・API スキャフォールドのみ。本番ゲート・`community-integration.json` では `tenant_mail_connect_*: false`。  
> ライブ pilot 時は `ORGOS_EMAIL_WIRE_REQUIRED=1` と mail-config / OAuth 設定後に Phase 4 を実行。  
> 出荷チェックリスト: [gmail-ship-gate-checklist.md](gmail-ship-gate-checklist.md)  
> Phase 4b ステージング: `./scripts/phase4b-community-gmail-staging.sh check`  
> Phase 5（CEO 承認後）: `ORGOS_CEO_SHIP_APPROVED=1 ./scripts/mal-ship-gate-apply.sh dry-run`

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

## 関連

- [google-oauth-setup.md](../../OS_Community/docs/google-oauth-setup.md)（Community OAuth redirect）
- `src/lib/protocol/community-tenant-mail-api.ts`
- `src/lib/protocol/community-gmail-bind.ts`
