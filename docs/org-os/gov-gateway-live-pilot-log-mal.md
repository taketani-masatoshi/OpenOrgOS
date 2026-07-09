# Gov Gateway live pilot log — mal (reference)

**Tenant:** mal · **Profile:** xroad_v7 · **Date:** 2026-07-09  
Do not paste secrets or full tokens.

| Phase | Status | Notes |
|-------|--------|-------|
| 0 Mock | PASS | `GOV_GATEWAY_TRANSPORT=mock` · `tests/gov-gateway-live.test.ts` |
| 1 Reachability | PENDING | Set `GOV_XROAD_SECURITY_SERVER_URL` for operator sandbox |
| 2 Auth | PENDING | Set `GOV_XROAD_TOKEN` (Bearer) |
| 3 Encode | PASS | `gov-gateway encode --event-id … --profile xroad_v7` (mock) |
| 4 Deliver | PASS | mock transport HTTP 202 · `deliverEnvelopeViaGovGateway` E2E |

Operator: copy to private log and complete Phase 1–2 with live Security Server credentials.
