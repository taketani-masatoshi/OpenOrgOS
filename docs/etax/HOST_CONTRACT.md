# e-Tax official host contract (COM / Cocoa)

**Status:** catalog tip `hostBound: false` (Darwin/CI) · Windows `tools/etax-host` binds at runtime · **Date:** 2026-09-21  
**Module:** `jp_etax` · ADR [0078](../adr/0078-etax-integration.md)

This document is the contract for binding NTA-distributed native modules via the
**etax-host** JSON-RPC/stdio process. OpenOrgOS must not invent HTTP endpoints,
request IDs (e.g. sample login `XU00S010` as a filing id), or a homegrown XML-DSig.

Host protocol: `src/lib/etax/host-client.ts` · Windows entry: `tools/etax-host/`.

## Signature (e-tax05)

| Platform | Surface | Method |
|----------|---------|--------|
| Windows | COM `nta.CLCXtxSigner` (`CLXtxSigner.dll`) | `SignToReport` |
| Cocoa | `CLISignature` framework | `SignToReport` |

Catalog: `steward/jurisdiction-packs/JP/modules/jp_etax/spec/signature-catalog.yaml`  
`hostBound: false` until a separate host process is shipped and reviewed.

Rules:

- PIN / password stay on the NTA module / OS dialog — never CLI flags or YAML
- OrgOS passes document bytes + bound `xmlHash` only
- Mock signatures (`legal: false`) are forbidden outside `--env mock`

## Transport (e-tax04)

| Platform | Surface | Methods |
|----------|---------|---------|
| Windows | COM `nta.CLCCommunication` | `CreateRequest`, `Send`, `GetResponse`, … |

Catalog: `steward/jurisdiction-packs/JP/modules/jp_etax/spec/transport-catalog.yaml`  
`hostBound: false` until bound.

Rules:

- Request IDs come from the host / official spec — do not reuse sample login IDs such as `XU00S010` as filing IDs
- Receipt field map requires e-tax18 (retrieved locally; OrgOS map still optional)
- `--env test` calls the official adapter and must `SPEC_BLOCKED` when unbound (never silently fall back to mock)
- Mock transport receipts are prefixed `MOCK-NOT-NTA-`

## Environments

| Env | Signature | Transport |
|-----|-----------|-----------|
| `mock` | Mock adapter only | Mock adapter only |
| `test` | Official (host required) | Official (host required) |
| `production` | Official + production-gate | Official + production-gate + NTA evidence |

## Operator bind (T-O1)

1. Install NTA CLXtxSigner / CLCommunication on Windows
2. Run `ORGOS_ETAX_HOST_MODE=com node tools/etax-host/etax-host.mjs`
3. `orgos etax host status` → signatureBound + transportBound
4. Set catalog `hostBound: true` only after health succeeds (repo tip stays false for Darwin/CI)

## Out of scope for tip / CI

NTA transmission test evidence and flipping `production-gate.yaml` remain **operator certification** work. Darwin CI keeps `hostBound: false`.
