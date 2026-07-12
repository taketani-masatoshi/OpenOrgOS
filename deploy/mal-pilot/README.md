# mal Wire + Hub pilot stack

Witness Hub（HUB-A/B）と mal テナントの protocol 設定を組み合わせたローカル本番パイロット用 compose です。

## Quick start

```bash
# Full operator setup (init + registry + relay instructions)
./scripts/setup-mal-wire-operator.sh

# Or step-by-step:
# 1. mal protocol 設定（未作成時）
./scripts/init-tenant-wire-pilot.sh mal

# 2. Hub 起動
docker compose -f deploy/witness-hub/docker-compose.yaml up -d hub-a hub-b

# 3. ゲート + relay スモーク
./scripts/wire-hub-stack-smoke.sh mal

# 4. relay 常駐（optional profile）
docker compose -f deploy/witness-hub/docker-compose.yaml \
  -f deploy/mal-pilot/docker-compose.relay.yaml --profile relay up -d
```

## Ports

| Service | URL |
|---------|-----|
| HUB-A | http://127.0.0.1:9474 |
| HUB-B | http://127.0.0.1:9475 |
| Wire Gateway (別途) | https://wire.oorgos.org (Mode A) · local 8443 |

## Production gates

```bash
WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 PUBLIC_BASE_URL=https://wire.oorgos.org \
  ./scripts/prod-validate-wire.sh mal
```

## Cloudflare Tunnel (Docker · token)

```bash
cp deploy/mal-pilot/env/cloudflared-wire.env.example deploy/mal-pilot/env/.env.cloudflared
# CLOUDFLARE_TUNNEL_TOKEN を .env.cloudflared に設定
docker compose --env-file deploy/mal-pilot/env/.env.cloudflared \
  -f deploy/mal-pilot/docker-compose.cloudflared.yaml up -d
```

**Zero Trust（必須）:** トンネル `9b5ebf8d-…` → Public Hostname `wire.oorgos.org` → `http://host.docker.internal:8443`

**DNS（oorgos.org）:** `CNAME wire` → `9b5ebf8d-01c3-4772-ae4a-f7596c7ebe63.cfargotunnel.com`（proxied）

Wire Gateway はホスト `:8443` で常駐（`./scripts/phase2-mal-wire-live.sh mal`）。

## systemd（本番常駐 · Top5）

```bash
# mal Wire Gateway + Protocol Relay
sudo ./scripts/install-mal-wire-systemd.sh mal

# または operator 一括
./scripts/setup-mal-wire-operator.sh --install-systemd
```

Units: `deploy/mal-pilot/systemd/steward-wire-gateway@.service` · `steward-protocol-relay@.service`  
Env: `deploy/mal-pilot/env/wire-gateway-mal.env.example` → `/etc/steward/wire-gateway-mal.env`

## TLS Mode A (ACME)

Caddy example: `deploy/mal-pilot/caddy/Caddyfile.example`  
Set `WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1` and `PUBLIC_BASE_URL=https://wire.oorgos.org`

## Legacy paths

- Wire Gateway: `deploy/wire-gateway/systemd/steward-wire-gateway@.service`
- Protocol relay: `deploy/protocol-relay/systemd/steward-protocol-relay@.service`

## Phase 4 — email_wire live (SMTP/IMAP · Xserver)

Phase 2–3（Wire Gateway + witness）のみで `./scripts/prod-validate-wire.sh mal` は **デフォルト PASS**（email_wire は deferred）。

Phase 4（`ai@malkk.com` · Xserver SMTP/IMAP）を **blocking ゲート**にする場合:

```bash
export ORGOS_EMAIL_WIRE_REQUIRED=1
ORGOS_EMAIL_WIRE_REQUIRED=1 ./scripts/prod-validate-wire.sh mal
```

Setup:

```bash
# 1. L2 credentials (gitignore)
cp deploy/mal-pilot/env/mail-wire-mal.env.example deploy/mal-pilot/env/.env.mail-wire
# ORGOS_SMTP_USER=ai@malkk.com · password を設定

# 2. mail-config（script が example から自動作成可）
cp tenants/mal/records/executive/mail-config.yaml.example \
   tenants/mal/records/executive/mail-config.yaml

# 3. readiness + doctor
./scripts/phase4-mal-email-wire-live.sh mal check

# 4. live roundtrip（ai@malkk.com → ai+wireloop@malkk.com → IMAP → wire-scan）
./scripts/phase4-mal-email-wire-live.sh mal live
```

**前提:** Wire Gateway 起動中（`./scripts/phase2-mal-wire-live.sh mal`）· Vitest 停止 · `info@malkk.com` は使用しない。

Registry 衛生（orphan outbound · envelope/receipt なし）:

```bash
npm run orgos -- --tenant mal protocol transaction prune-orphans          # dry-run
npm run orgos -- --tenant mal protocol transaction prune-orphans --apply
```

See [wire-hub-stack-pilot.md](../../docs/org-os/wire-hub-stack-pilot.md).

**出荷チェックリスト:** [gmail-ship-gate-checklist.md](../../docs/org-os/gmail-ship-gate-checklist.md) · env 例: `deploy/mal-pilot/env/mal-ship-gate.env.example`  
**Ship-gate dry-run (opt-in · systemd 非変更):** `./scripts/mal-ship-gate-check.sh mal`  
**Phase 4b staging:** `./scripts/phase4b-community-gmail-staging.sh check`  
**Phase 5 apply (CEO 承認後のみ):** `ORGOS_CEO_SHIP_APPROVED=1 ./scripts/mal-ship-gate-apply.sh dry-run|apply`
**Washout F7–F10:** [phase4a-washout-f7-f10.md](../../docs/org-os/phase4a-washout-f7-f10.md)
