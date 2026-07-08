# Gov Gateway live pilot checklist

1. Init sandbox config: `orgos protocol gov-gateway sandbox init --tenant {id}`
2. Copy env template: `steward/platform/protocol/seed/gov-gateway-sandbox.env.example`
3. Set sandbox URLs / member codes from EE / JP / GE operators (`GOV_*_URL` env vars)
4. Env: `GOV_GATEWAY_TRANSPORT=live` (default) or `mock` for offline CI
5. Peer `transport: gov_gateway` + `gov_gateway.profile_id`
6. Validate: `orgos protocol gov-gateway validate --tenant {id}`
7. Live reachability: `orgos protocol gov-gateway health --profile xroad_v7 --live --tenant {id}`
8. Dry-run encode: `orgos protocol gov-gateway encode --event-id … --profile xroad_v7`
9. Deliver: `orgos protocol deliver --peer PEER-* --file envelope.json`

Live SS integration remains operator-owned; mock path stays test default when `GOV_GATEWAY_TRANSPORT=mock`.
