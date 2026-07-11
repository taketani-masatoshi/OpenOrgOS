---
description: OpenOrgOS Engineering Constitution — purpose, AI rules, definition of done
alwaysApply: true
---

# OpenOrgOS Engineering Constitution

Version: 1.0 · Status: Active  
Applies to: All repositories, all languages, all contributors (human and AI)

**Canonical index:** [openorgos-engineering-constitution.md](../openorgos-engineering-constitution.md) · **Split rules:** [engineering/00-このフォルダについて.md](../engineering/00-このフォルダについて.md)

---

# Purpose

OpenOrgOS is designed as infrastructure that may be maintained for decades.

Therefore:

- Correctness is more important than implementation speed.
- Maintainability is more important than cleverness.
- Explicitness is more important than implicit behavior.
- Consistency is more important than individual coding style.

When trade-offs exist, always prioritize long-term maintainability.

---

# 10. AI Coding Rules

AI assistants (Cursor, Claude Code, ChatGPT, Copilot, etc.) must follow these rules.

When proposing implementations:

1. Never violate this constitution.
2. Explain architectural trade-offs.
3. Prefer simple code over clever code.
4. Avoid unnecessary dependencies.
5. Avoid duplication.
6. Prefer deterministic implementations.
7. Keep business logic framework-independent.
8. Suggest refactoring when complexity increases.
9. Do not optimize prematurely.
10. If uncertain, ask instead of guessing.

---

# 11. Definition of Done

A feature is complete only if:

- Architecture is consistent
- Tests pass
- Lint passes
- Formatting passes
- Documentation updated
- No duplicated logic
- No dead code
- No TODO left behind

---

# Final Principle

OpenOrgOS is expected to outlive current programming languages and frameworks.

Code should therefore optimize for longevity, readability, auditability, and correctness rather than short-term convenience.

---

## Related rules (split · full index)

| File | Topic |
|------|-------|
| [01-architecture.md](01-architecture.md) | SSOT · layers · CLI path |
| [02-typescript.md](02-typescript.md) | TypeScript · coding principles |
| [03-python.md](03-python.md) | Python |
| [04-testing.md](04-testing.md) | Domain testing |
| [05-git.md](05-git.md) | Git · PR safety |
| [06-documentation.md](06-documentation.md) | README · CHANGELOG · ADR |
| [07-security.md](07-security.md) | L0–L3 pointers (operator-policy canonical) |
| [08-event-sourcing.md](08-event-sourcing.md) | Event First · immutable · deterministic |
| [09-openorgos-domain.md](09-openorgos-domain.md) | OrgOS 4-layer · Wire · catalog/roster |

