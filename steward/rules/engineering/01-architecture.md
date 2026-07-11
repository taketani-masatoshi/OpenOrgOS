---
description: OpenOrgOS architecture — SSOT, catalog/roster, layers, CLI path
globs: "src/**,schemas/**"
---

# Architecture

**Index:** [openorgos-engineering-constitution.md](../openorgos-engineering-constitution.md)

---

# 1. Architecture Principles

## 1.1 Single Source of Truth (SSOT)

Every business entity has exactly one authoritative source.

Allowed: Cache · Replica · Read Model · Search Index

Not allowed: Multiple writable sources · Synchronizing business logic between databases

**OrgOS:** Tenant `data/**/*.yaml` is authoritative · `docs/` is human-facing derived view.

---

## 1.2 Separate Catalog from Active Roster

Definitions and runtime instances must never be mixed.

| Catalog | Active Roster |
|---------|---------------|
| Role Definition | User Assignment |
| Event Definition | Active Organization |
| Permission Definition | Current Membership |
| Organization Template | Current Permission |

**OrgOS:** `schemas/agent-catalog.ts` (definitions) vs `schemas/agent-roster.ts` (assignments).

---

## Event principles (§1.3–1.5)

Event First · Immutable Events · Deterministic replay are defined in [08-event-sourcing.md](08-event-sourcing.md).  
Architecture decisions that store mutable state as sole truth violate §1.1 SSOT.

---

## 1.6 Stateless Services

Services should not keep session state. Persist only business data.

## 1.7 Composition over Inheritance

Prefer composition. Avoid deep inheritance.

## 1.8 Dependency Injection

Dependencies are injected. Avoid direct construction inside business logic.

## 1.9 Explicit over Implicit

Avoid hidden behavior and magic. Code should be obvious.

## 1.10 Small Modules

Each module has one responsibility. If a module needs "and", split it.

---

# 2. Domain Design

Business rules belong inside Domain.

UI · Database · Frameworks must not contain business rules.

---

# 3. Layer Architecture

```
CLI → API → Application → Domain → Repository → Storage
```

GUI and API must execute exactly the same Application commands.

**OrgOS path:** `orgos validate` → `src/commands/` → `src/lib/` → YAML/FS

---

# 6. Rust-inspired Principles

- Ownership should always be clear.
- Mutable state should be minimized.
- Prefer compile-time safety.
- Explicit error handling.
- Avoid shared mutable state.
- Make invalid states impossible where practical.

---

# 7. CLI Standard Path

```
CLI → Validation → Application Command → Domain → Repository → Storage
```

No shortcuts. GUI and REST API execute the same commands.

