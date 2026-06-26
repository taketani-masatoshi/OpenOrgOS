# Steward OS ↔ OpenOrgOS Layer Mapping

**Parent:** [openorgos-core-philosophy.md](openorgos-core-philosophy.md)  
**Purpose:** Map this repository to the four-layer model. Use before adding Core code.

## Protocol vs this repository

**OpenOrgOS Core** = global inter-org protocol — **four artifacts only**:

1. Org Event Model  
2. Identity exchange  
3. Authority delegation  
4. Auditability  

**National / domain committees** (country · industry adapters) own business logic, legal interpretation, and organizational behavior.

**Steward OS** (this repo) = reference **distribution** that includes:

| Scope | In this repo? | Path |
|-------|---------------|------|
| **Protocol primitives (exchange)** | Partial · `schemas/protocol/` · `steward protocol` CLI | `steward/platform/protocol/` · tenant `data/protocol/` |
| Internal organization management | Yes · majority today | Finance · HR seeds · modules · tenant `data/` |
| Local law / sector | Yes | jurisdiction-packs · steward/modules |

When adding features, ask: **Is this verifiable cross-org exchange, or internal/single-tenant ops?**  
Internal ops belong in Implementation or Adapters — not Core protocol expansion.

## Core four → Steward artifacts (today)

| Core artifact | Steward artifact (partial) | Gap |
|---------------|----------------------------|-----|
| **Org Event Model** | `schemas/protocol/org-event.ts` · EventEnvelope · queue map | Federation mesh · multi-hop routing |
| **Identity exchange** | `protocol identity export` · `peers.yaml` · `protocol_public_key` in identity | Automated peer discovery |
| **Authority delegation** | `protocol delegation export` · REG-004 scope map · approver registry | External verifier tooling |
| **Auditability** | `data/protocol/audit-chain.jsonl` · `protocol audit verify` · inbox mirror | ~~Third-party witness network~~ → **Witness Hub プール**（部分実装） |

Decisions · obligations · policies in tenant data are **committee/implementation concerns** until encoded as Org Events.

## Layer map

| OpenOrgOS layer | Steward OS path | Role |
|-----------------|-----------------|------|
| **Core** | `steward/core/` · `schemas/protocol/` · audit · routing · classification · webhook/queue | **Protocol wire** — four artifacts *(agents/skills today = distribution, not normative Core)* |
| **National committee** | `steward/jurisdiction-packs/{JP,HK,…}/` · `steward/jurisdictions/` | Legal interpretation · national behavior · REG templates |
| **Domain committee** | `steward/modules/{clinic,…}/` · `canonical-sectors.yaml` | Business logic · sector behavior · operations CLI |
| **Organization Implementation** | `tenants/{id}/` | Internal management runtime |

## Core primitives (present)

| Concept | Steward artifact |
|---------|------------------|
| Organization | `tenants/{id}/tenant.yaml` · `data/company.yaml` |
| Role / Authority | `steward/core/agents/registry.yaml` · REG-004 approval authority |
| Delegation | `steward/core/orchestrators/` · work orders |
| Policy | regulations catalog framework · `regulations.yaml` bind |
| Capability | `business-capability-catalog.yaml` (JP adapter) · module manifests |
| Audit | `src/lib/audit-log.ts` · `data/protocol/audit-chain.jsonl` · classification registry |
| Versioning | git-tracked docs · `packs.lock.yaml` pin |
| Workflow | Skill registry · `operations` CLI bundles |

## Correct placement examples

| Feature | Layer | Path |
|---------|-------|------|
| 商標登録願 | Country (JP) | `jurisdiction-packs/JP/modules/jp_trademark_application/` |
| 補助金申請 | Country (JP) | `jurisdiction-packs/JP/modules/jp_subsidy_application/` |
| REG-HK-001 役員報酬 | Country (HK) | `jurisdiction-packs/HK/regulations/` |
| クリニック受付 | Industry | `steward/modules/clinic/` |
| 宿泊 PMS | Industry | `steward/modules/hospitality/` |
| MAL 会社データ | Organization | `tenants/mal/data/company.yaml` |

## Known Core drift (refactor candidates)

Items that violate “local belongs in Adapters” but exist today:

| Item | Current location | Target layer |
|------|------------------|--------------|
| `tax_filing_prep` skill | `steward/core/skills/` | Country adapter module (e.g. `jp_tax_corporate`) |
| Finance agent “JP kessan” wording | `steward/core/agents/finance_agent.md` | JP adapter docs only |
| `hospitality_agent` · `property_rental_agent` | `steward/core/agents/` | Industry module proxy only (already partially true) |
| JP-specific finance schema fields | `schemas/finance/` | Split universal vs `schemas/jp-*` adapter |

**Rule:** New country-only or industry-only features must not expand `steward/core/`.

## Extension order (when adding features)

0. Is it one of the **Core four** (Org Event Model · identity · authority · audit)? → Core protocol candidate  
1. Is it **business logic, legal interpretation, or org behavior**? → **National or domain committee** (adapter/module)  
2. Can it live in **Organization** (`tenants/{id}/data/`)? → tenant implementation  
3. Else **Core** — only if [design questions](openorgos-core-philosophy.md#design-questions) pass

## Related catalogs

| Catalog | Layer | File |
|---------|-------|------|
| JP business capabilities | Country | `steward/jurisdiction-packs/JP/business-capability-catalog.yaml` |
| Module readiness | Industry + Country | `steward/modules/readiness.yaml` |
| Core agents | Core | `steward/core/agents/registry.yaml` |
| Jurisdiction packs | Country | `steward/jurisdictions/registry.yaml` |
