# Wire Trust Registry (WG-4)

Platform registry for Wire Node identity resolution — complements [trusted-hubs.yaml](../../steward/platform/protocol/trusted-hubs.yaml) (Witness layer).

## Purpose

| Layer | Registry | Identifiers |
|-------|----------|-------------|
| **Wire P2P** | `wire-trust-registry.yaml` | `node_id` · `did:ooo:org:*` · `steward://tenant/*` |
| **Witness** | `trusted-hubs.yaml` | `hub_id` · `hub_public_key` |

## OpenOrg DID

Format: `did:ooo:org:{identifier}`

| Derivation | Example |
|------------|---------|
| Tenant (legacy slug) | `did:ooo:org:demo` — **deprecated**; use pk-DID in production |
| Public key fingerprint (production) | `did:ooo:org:pk-2da32dcd88900ba3` |

Schema: [`schemas/protocol/openorg-did.ts`](../../schemas/protocol/openorg-did.ts)

## Well-known document

`GET /.well-known/wire-node.json` includes optional fields:

- `did` — OpenOrg DID
- `trust_registry_url` — platform registry mirror URL

## CLI

```bash
# Tenant Wire node
orgos wire-gateway did init --tenant demo
orgos wire-gateway did show --tenant demo

# Platform registry
orgos protocol trust-registry validate
orgos protocol trust-registry list
orgos protocol trust-registry resolve --id did:ooo:org:pk-2da32dcd88900ba3

# Pin keys
orgos protocol trust-registry pin-local --tenant demo --force
orgos protocol trust-registry sync-keys --node-id org.example.co.jp --force
# Production: pk-DID required (registry migrated 2026-07-10):
ORGOS_REQUIRE_PK_DID=1 orgos protocol trust-registry validate
# Strict mode (empty keys = error):
ORGOS_STRICT_TRUST=1 orgos protocol trust-registry validate
```


## Peer resolution

Inbound `WireMessage.sender` may be:

1. DNS-style `node_id` (`org.example.co.jp`)
2. `steward://tenant/{id}` or tenant slug
3. `did:ooo:org:{id}`

Gateway matches against Internal API `/peers` (`peer_did` · `peer_node_id` · `peer_node_uri`) and platform trust registry.

## Publish

Mirror: `steward/platform/protocol/wire-trust-registry.yaml`  
Target: `https://oorgos.org/protocol/wire-trust-registry.yaml`

Pin `protocol_public_key` before production (warnings on validate when empty).
