---
description: OpenOrgOS testing — domain-first, no HTTP/DB in unit tests
globs: "**/*.{test,spec}.{ts,tsx,js,jsx}"
---

# Testing

**Index:** [openorgos-engineering-constitution.md](../openorgos-engineering-constitution.md) · **Taxonomy:** [testing-modules.md](../testing-modules.md)

---

# 8. Testing

Business Logic should be testable without:

- HTTP
- Database
- Framework
- GUI

Tests should focus on Domain behavior.

---

## OrgOS conventions

| Axis | Command |
|------|---------|
| Contract / Meta | `npm run test:contract` |
| Platform (`src/lib/`) | `npm run test:platform` |
| Catalog modules | `npm run test:catalog` |
| Integration (CLI · E2E) | `npm run test:integration` |
| Full CI gate | `npm test` |

- Catalog module tests: import domain directly · `setTenantId` explicit · no HTTP unless integration tier
- After registry changes: `npm run test:registry:sync` → `npm run test:registry:check`

Definition of Done includes tests pass — see [00-engineering-constitution.md](00-engineering-constitution.md) §11.

