# Steward OS ↔ OpenOrgOS Layer Mapping

**Parent:** [openorgos-core-philosophy.md](openorgos-core-philosophy.md)  
**Purpose:** Map this repository to the four-layer model. Use before adding Core code.

## Layer map

| OpenOrgOS layer | Steward OS path | Role |
|-----------------|-----------------|------|
| **Core** | `steward/core/` · `src/lib/{tenant,modules,routing,audit,classification,delegation}.ts` · `steward/rules/` | Universal org primitives — Agent · Skill · routing · audit · policy framework |
| **Country Adapter** | `steward/jurisdiction-packs/{JP,HK,…}/` · `steward/jurisdictions/` | Law → protocol — REG templates · tax profile schema · declaration modules |
| **Industry Adapter** | `steward/modules/{clinic,hospitality,…}/` · `steward/modules/canonical-sectors.yaml` | Sector ops · ISO-bound REG · invoice seeds · operations CLI |
| **Organization Implementation** | `tenants/{id}/` — `data/` · `docs/` · `modules.yaml` · `regulations.yaml` | Runtime config — company SoT · enabled modules · enacted policies |

## Core primitives (present)

| Concept | Steward artifact |
|---------|------------------|
| Organization | `tenants/{id}/tenant.yaml` · `data/company.yaml` |
| Role / Authority | `steward/core/agents/registry.yaml` · REG-004 approval authority |
| Delegation | `steward/core/orchestrators/` · work orders |
| Policy | regulations catalog framework · `regulations.yaml` bind |
| Capability | `business-capability-catalog.yaml` (JP adapter) · module manifests |
| Audit | `src/lib/audit-log.ts` · classification registry |
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

1. Can it live in **Organization** (`tenants/{id}/data/`)? → tenant config first  
2. Else **Industry module** (`steward/modules/` or pack `modules/`)  
3. Else **Country adapter** (`jurisdiction-packs/{code}/`)  
4. Else **Core** — only if all five [design questions](openorgos-core-philosophy.md#design-questions) pass  

## Related catalogs

| Catalog | Layer | File |
|---------|-------|------|
| JP business capabilities | Country | `steward/jurisdiction-packs/JP/business-capability-catalog.yaml` |
| Module readiness | Industry + Country | `steward/modules/readiness.yaml` |
| Core agents | Core | `steward/core/agents/registry.yaml` |
| Jurisdiction packs | Country | `steward/jurisdictions/registry.yaml` |
