---
description: OpenOrgOS domain model — 4-layer, agents, Wire, catalog/roster
globs: "steward/**,schemas/**,data/**"
---

# OpenOrgOS Domain Model

**Index:** [openorgos-engineering-constitution.md](../openorgos-engineering-constitution.md)

---

## 4-layer stack (OrgOS)

```
Executive Steward → Agent → Skill + CLI → Data (YAML/MD)
```

| Layer | Role | Canonical |
|-------|------|-----------|
| Executive | Dashboard · summaries only | [steward_os_principles.md](../steward_os_principles.md) |
| Agent | Department scope · Skill dispatch | [steward/core/agents/](../../core/agents/00-このフォルダについて.md) |
| Skill | Deterministic I/O · `runtime: cli` preferred | [steward/core/skills/](../../core/skills/00-このフォルダについて.md) |
| Data | YAML/MD source of truth | Tenant `data/` · `docs/` |

Human makes final decisions. Agents propose and draft only.

---

## Catalog vs Active Roster

| Catalog (definition) | Roster (runtime) |
|---------------------|------------------|
| Agent capability manifest | Agent roster assignments |
| Skill registry | Skill invocations / work orders |
| Module catalog | `modules.yaml` activation |
| Wire trust registry | Hub federation · registered orgs |

Schemas: `schemas/agent-catalog.ts` · `schemas/agent-roster.ts`

Never write roster state into catalog files or vice versa.

---

## Wire & protocol

| Topic | Spec / code |
|-------|-------------|
| Wire gateway | [docs/org-os/wire-gateway-requirements.md](../../../docs/org-os/wire-gateway-requirements.md) |
| Trust registry | [docs/org-os/wire-trust-registry.md](../../../docs/org-os/wire-trust-registry.md) |
| Protocol schemas | `schemas/protocol/` · `src/lib/protocol/` |
| CLI | `orgos protocol` · `src/commands/protocol/` |

Inter-org wire send requires human approval — see [07-security.md](07-security.md).

---

## Development alignment

- Tool-neutral: [tool-neutral-development.md](../tool-neutral-development.md)
- Event rules: [08-event-sourcing.md](08-event-sourcing.md)
- Architecture: [01-architecture.md](01-architecture.md)

