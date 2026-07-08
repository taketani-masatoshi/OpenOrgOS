# Gov Gateway live pilot checklist

Operator-owned credentials · do not commit tokens. CI uses `GOV_GATEWAY_TRANSPORT=mock`.

## Phases

| Phase | Gate | Command / action | Failure triage |
|-------|------|------------------|----------------|
| **0 Mock** | Adapter unit tests green | `GOV_GATEWAY_TRANSPORT=mock` · `gov-gateway validate` | Fix registry / profile YAML |
| **1 Reachability** | HTTP status under 500 on sandbox base URL | `gov-gateway health --profile … --live` | DNS · firewall · wrong `GOV_*_URL` |
| **2 Authenticated health** | Same + `GOV_*_TOKEN` accepted (not 401) | set token env · `--live --json` | Rotate token · check Authorization scheme |
| **3 Encode dry-run** | Native message encodes | `gov-gateway encode --event-id … --profile …` | Envelope missing · profile binding |
| **4 Deliver** | HTTP 2xx / correlation id | `protocol deliver --peer … --file …` | Peer `transport: gov_gateway` · SS routing |

## Setup steps

1. `orgos protocol gov-gateway sandbox init --tenant {id}`
2. Copy `steward/platform/protocol/seed/gov-gateway-sandbox.env.example` → shell env
3. Set `GOV_XROAD_SECURITY_SERVER_URL` / `GOV_EGOV_API_BASE_URL` / `GOV_GE_API_BASE_URL`
4. Optional auth: `GOV_XROAD_TOKEN` · `GOV_EGOV_TOKEN` · `GOV_GE_TOKEN` (Bearer)
5. `GOV_GATEWAY_TRANSPORT=live`
6. Peer: `transport: gov_gateway` + `gov_gateway.profile_id`
7. Validate → health `--live` → encode → deliver

## Recording

Copy [gov-gateway-live-pilot-log.md.example](gov-gateway-live-pilot-log.md.example) per pilot run. **Never** paste secrets or full tokens into the log.
