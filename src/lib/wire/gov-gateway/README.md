# Gov Gateway Adapters (implementation)

**Spec (正本):** [`docs/org-os/gov-gateway-adapter-spec.md`](../../../../docs/org-os/gov-gateway-adapter-spec.md)  
**Overview:** [`docs/org-os/gov-gateway-adapters.md`](../../../../docs/org-os/gov-gateway-adapters.md)

## Layout

```
adapters/
  xroad-v7.ts           # xroad_v7 · xroad_v6 · xroad_v7_dj
  jp-egov-central.ts    # jp_egov_central
  ge-3g.ts              # ge_gov_gateway_3g
  stub.ts               # unimplemented profile fail-fast
config.ts               # registry · tenant yaml · resolveAdapter · validate
encode-openorgos-mime.ts
transport-http.ts       # Http + MockGovGatewayTransport
deliver.ts              # deliverEnvelopeViaGovGateway
ingest.ts               # decodeGovGatewayInbound(+Sync)
audit-bridge.ts
types.ts
```

## P0 (implemented)

- OpenOrgOS MIME encode/decode
- Mock transport · deliver via `transport.ts` `gov_gateway` branch
- Webhook ingest decode (`format: gov_gateway`)
- Native X-Road REST producer (`producer-server.ts` · `gov-gateway serve`)
- CLI: `orgos protocol gov-gateway validate|encode|decode|health|serve`

## Profiles

YAML under `steward/jurisdiction-packs/{EE,JP,GE}/protocol/` · registry `steward/platform/protocol/gov-gateway-adapters.yaml`
