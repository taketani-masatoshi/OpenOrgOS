# Operator Console — HTTPS 公開 Runbook（operator.oorgos.org）

**版:** 1.0 · **日付:** 2026-08-24  
**対象:** Mac mini + Docker Compose + Cloudflare Tunnel `oorgos-org`  
**関連:** [passkey-field-validation-log.md](passkey-field-validation-log.md) · [operator-production.md](../operator-production.md)

## 目的

WebAuthn / PassKey の本番 `rp_id` を **安定 HTTPS origin** に固定し、現場検証 #1–#5 を実施できるようにする。

| ホスト | 役割 |
|--------|------|
| `operator.oorgos.org` | Operator Console（Chat + Wire + 予実） |
| `community.oorgos.org` | Community（SSO handoff 発行元） |

## 前提

- Tunnel: **`oorgos-org`** · ID `683a2039-939a-4e0a-9e4f-3591accfcf13`
- `./scripts/start-local-stack.sh` で `operator-console` プロファイルが起動していること
- `cloudflared-inc` は `network_mode: service:web`（Community web と同一ネットワーク名前空間）

## 1. Cloudflare DNS

[Cloudflare DNS](https://dash.cloudflare.com/) → `oorgos.org` → **DNS → Records**

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `operator` | `683a2039-939a-4e0a-9e4f-3591accfcf13.cfargotunnel.com` | **ON（橙）** |

## 2. Zero Trust Public Hostname

1. https://one.dash.cloudflare.com/ → **Networks → Connectors → oorgos-org**
2. **Published application routes / Public Hostname** を追加:

| Subdomain | Domain | Type | URL |
|-----------|--------|------|-----|
| `operator` | `oorgos.org` | HTTP | `http://operator-console:9470` |

> `community` は既存どおり `http://127.0.0.1:3000`（cloudflared が web 名前空間共有のため）。

参照: [OS_Community/deploy/cloudflared/oorgos-org.ingress.yml](../../OS_Community/deploy/cloudflared/oorgos-org.ingress.yml)

## 3. Mac `.env`（OS_Community）

```bash
# Operator Console — production WebAuthn
WIRE_CONSOLE_WEBAUTHN_RP_ID=operator.oorgos.org
WIRE_CONSOLE_WEBAUTHN_ORIGIN=https://operator.oorgos.org
ORGOS_COOKIE_SECURE=1
WIRE_CONSOLE_AUTH=prod
WIRE_CONSOLE_PROD_ADAPTER=webauthn
NEXT_PUBLIC_OPERATOR_CONSOLE_URL=https://operator.oorgos.org
```

Community SSO handoff（既存）:

```bash
COMMUNITY_CONSOLE_OIDC_ISSUER=https://community.oorgos.org
COMMUNITY_CONSOLE_OIDC_AUDIENCE=orgos-operator-console
COMMUNITY_CONSOLE_OIDC_HS256_SECRET=<shared-secret>
```

## 4. 起動

```bash
cd /Users/kk/OS_Community
./scripts/start-local-stack.sh
# 502 防止: cloudflared は force-recreate 済み（スクリプト内）
```

## 5. 公開確認

```bash
curl -sI https://operator.oorgos.org/health | head -5
curl -s https://operator.oorgos.org/health
curl -s https://operator.oorgos.org/chat/v1/auth/config | head -c 400
```

期待:

- `/health` → 200 · `"ok":true`
- `/chat/v1/auth/config` → `webauthn.origin` = `https://operator.oorgos.org` · `rp_id` = `operator.oorgos.org`

## 6. Passkey 現場チェック

```bash
cd /Users/kk/OS_Steward
export ORGOS_TENANT=mal
npm run passkey:field-check -- --url https://operator.oorgos.org --record
```

自動: #1 origin 整合 · #4 credential 0600 · #5 doctor  
手動: #2 Mac Touch ID 再ログイン · #3 iPhone hybrid 決済鍵 + tier B step-up

記録正本: [passkey-field-validation-log.md](passkey-field-validation-log.md)

## 7. トラブルシュート

| 症状 | 対処 |
|------|------|
| 502 on operator | `./scripts/start-local-stack.sh` で `operator-console` 起動確認 · Tunnel URL が `http://operator-console:9470` か |
| origin mismatch | `.env` の `WIRE_CONSOLE_WEBAUTHN_*` と公開 URL が一致しているか |
| PassKey 失敗 | `ORGOS_COOKIE_SECURE=1` · HTTPS のみ · `rp_id` にポート番号を含めない |
| community 502 | [oorgos-subdomain-setup.md](../../OS_Community/docs/oorgos-subdomain-setup.md) §502 — `cloudflared-inc` force-recreate |
