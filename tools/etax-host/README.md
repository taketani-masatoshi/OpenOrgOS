# etax-host (Windows COM bridge)

JSON-RPC over stdio. OrgOS CLI/lib → this process → NTA COM
(`nta.CLCXtxSigner.SignToReport`, `nta.CLCCommunication.Send` / `GetResponse`).

## Run

```bash
# Unbound (Darwin / CI) — health.ok=false
node tools/etax-host/etax-host.mjs

# Stub for local contract tests (not NTA)
ORGOS_ETAX_HOST_MODE=stub node tools/etax-host/etax-host.mjs

# Windows + NTA modules + optional winax
ORGOS_ETAX_HOST_MODE=com node tools/etax-host/etax-host.mjs
```

Point OrgOS at the host:

```bash
export ORGOS_ETAX_HOST_CMD="node $(pwd)/tools/etax-host/etax-host.mjs"
```

Catalog YAML in the repo tip stays `hostBound: false`. Official adapters call the
host only when `hostBound: true` (operator-set after health) or when tests inject
a stub client.

## Rules

- Never pass PIN/password as JSON-RPC params
- Never invent request IDs; refuse `XU00S010` as a filing id
- See [docs/etax/HOST_CONTRACT.md](../../docs/etax/HOST_CONTRACT.md)
