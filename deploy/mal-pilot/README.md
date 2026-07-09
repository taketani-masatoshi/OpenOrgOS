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
| Wire Gateway (別途) | https://wire.mal.example (Mode A) · local 8443 |

## Production gates

```bash
WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 PUBLIC_BASE_URL=https://wire.mal.example \
  ./scripts/prod-validate-wire.sh mal
```

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
Set `WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1` and `PUBLIC_BASE_URL=https://wire.mal.example`

## Legacy paths

- Wire Gateway: `deploy/wire-gateway/systemd/steward-wire-gateway@.service`
- Protocol relay: `deploy/protocol-relay/systemd/steward-protocol-relay@.service`

See [wire-hub-stack-pilot.md](../../docs/org-os/wire-hub-stack-pilot.md).
