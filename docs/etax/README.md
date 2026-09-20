# e-Tax compatibility status

**EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION**

| Item | Value |
|------|--------|
| e-Tax compatibility status | Experimental. Not certified. Production submit disabled. |
| KSK2 spec version | `KSK2-2026-08-28` (listing). Reception start 2026-09-24. |
| Supported procedures | **none** (`UNSUPPORTED` default). Matrix empty until an OpenOrgOS mapping is explicit (e-tax07 retrieved ≠ SUPPORTED). |
| Test status | Phase 3 unit tests (signature catalog, mock adapter, official host unbound). No NTA transmission test. |
| Production status | `e-Tax production submission: NOT CERTIFIED / DISABLED` |

CLI: `orgos etax spec status`

Docs: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) · [THREAT_MODEL.md](./THREAT_MODEL.md) · ADR [0078](../adr/0078-etax-integration.md)
