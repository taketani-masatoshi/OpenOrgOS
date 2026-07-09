# Gov Gateway live pilot log — mal (reference)

**Tenant:** mal · **Profile:** xroad_v7 · **Date:** 2026-07-09  
Do not paste secrets or full tokens.

**Sandbox:** [X-Road Playground](https://x-road.global/xroad-playground) SS #2  
`GOV_XROAD_SECURITY_SERVER_URL=http://testcomss01.playground.x-road.systems`  
Client: `PLAYGROUND/COM/1234567-8/TestClient`

| Phase | Status | Notes |
|-------|--------|-------|
| 0 Mock | PASS | `GOV_GATEWAY_TRANSPORT=mock` · `tests/gov-gateway-live.test.ts` |
| 1 Reachability | **PASS (live)** | `gov-gateway health --profile xroad_v7 --live --json` → HTTP 200 · ~510 ms |
| 2 Auth | **PASS (live, N/A token)** | Playground は Bearer 不要 · `auth: false` · HTTP 200 |
| 3 Encode | **PASS (live)** | `gov-gateway encode --event-id 691e54e9-…` · OpenOrgOS MIME + X-Road headers |
| 4 Deliver | **PASS (live)** | `protocol deliver --peer PEER-081` → **HTTP 200** · `correlation_id: TX-20260709-001` |

## Phase 4 detail

- **Peer:** `PEER-081` · `transport: gov_gateway`
- **Endpoint:** `http://testcomss01.playground.x-road.systems` (SS SOAP interface — Playground REST は GET のみのため POST 2xx は SS ルート経由)
- **Binding:** `X-Road-Client: PLAYGROUND/COM/1234567-8/TestClient` · service `helloService`
- **Envelope:** `691e54e9-7fbb-41cd-9aee-496d86963b53` (outbox · steward-provenance OK)
- **Audit:** `tenants/mal/data/protocol/gov-gateway-audit.jsonl` — `ok: true`, `http_status: 200`

## Commands (replay)

```bash
export GOV_GATEWAY_TRANSPORT=live
export GOV_XROAD_SECURITY_SERVER_URL=http://testcomss01.playground.x-road.systems

node --import tsx src/cli.ts --tenant mal protocol gov-gateway health --profile xroad_v7 --live --json
node --import tsx src/cli.ts --tenant mal protocol gov-gateway encode --event-id 691e54e9-7fbb-41cd-9aee-496d86963b53 --profile xroad_v7 --json
node --import tsx src/cli.ts --tenant mal protocol deliver --peer PEER-081 --file tenants/mal/docs/protocol/outbox/691e54e9-7fbb-41cd-9aee-496d86963b53.json
```

## Production SS next steps

1. Set `GOV_XROAD_SECURITY_SERVER_URL` to operator Security Server
2. Set `GOV_XROAD_TOKEN` if required
3. Update `gov-gateway.yaml` member/subsystem/service codes for registered subsystem
4. Point peer at POST-capable notice-deliver REST path on production SS
