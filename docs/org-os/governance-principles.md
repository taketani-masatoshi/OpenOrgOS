# Governance principles and ISO 37000

**Canonical rule:** [steward/rules/governance-principles.md](../../steward/rules/governance-principles.md)  
**ADR:** [0024](../adr/0024-core-governance-principles-iso-37000.md)

OrgOS maps **ISO 37000:2021** (guidance, not a certification scheme) onto existing core controls: purpose in the business plan, named operators, human approval, budget envelopes, company events, and audit trails.

## Fulfilment

| Status | Meaning |
| --- | --- |
| `draft` | Pack initialized; evidence or purpose still incomplete |
| `ready` | `orgos governance principles status` is complete — **not** a signature |
| `self_declared` | A human ran `orgos governance principles declare --signatory "…"` |

OpenOrgOS Community does not issue ISO certificates. A self-declaration is the organization's own statement.

## CLI

```bash
orgos governance principles init
orgos governance principles status
orgos governance principles declare --signatory "Name"
```

`tenant init` writes a purpose skeleton and a declaration draft. Placeholder mission/vision does **not** count as ready.
