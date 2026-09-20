# e-Tax compatibility status

**EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION**

| Item | Value |
|------|--------|
| e-Tax compatibility status | Experimental. Not certified. Production submit disabled. |
| KSK2 spec version | `KSK2-2026-08-28` (listing). Reception start 2026-09-24. |
| Supported procedures | **RHO0010** = `EXPERIMENTAL` (`productionEligible: false`). All others UNSUPPORTED. |
| Test status | Implementation-100 local/mock E2E. No NTA transmission test. |
| Production status | `e-Tax production submission: NOT CERTIFIED / DISABLED` |

CLI: `orgos etax spec status`

Docs: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) · [HOST_CONTRACT.md](./HOST_CONTRACT.md) · [THREAT_MODEL.md](./THREAT_MODEL.md) · ADR [0078](../adr/0078-etax-integration.md)

**Not e-Tax対応完了.** Certification requires COM host bind + NTA transmission evidence + production-gate review.
