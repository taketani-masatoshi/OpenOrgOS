---
description: OpenOrgOS security — L0–L3 pointers (canonical operator-policy; glob-scoped)
globs: "src/**,data/**,tenants/**"
---

# Security & Data Classification

**Always-on policies:** [operator-policy.md](../operator-policy.md) · [folder_access_policy.md](../folder_access_policy.md) · `.cursor/rules/data-classification.mdc`

| ルール | 適用 | 役割 |
|--------|------|------|
| **data-classification.mdc** | alwaysApply | L0–L3 全文 · Git/AI 境界 |
| **operator-policy.md** | alwaysApply | RBAC · 4 層読取 · CLI 手順 |
| **本書 (07-security)** | `src/**`, `data/**` | コード/データ編集時の **短いリマインダ** — 詳細は上記2正本 |

**This file** must not duplicate L2/L3 rules — link only.

| Policy | Canonical path |
|--------|----------------|
| Operator boundary · RBAC | [operator-policy.md](../operator-policy.md) |
| Folder access · L0–L3 | [folder_access_policy.md](../folder_access_policy.md) |
| Classification registry | Tenant `data/classification-registry.yaml` |

---

## Summary (enforce via canonical sources)

| Level | AI auto-read | Output forbidden |
|-------|-------------|------------------|
| L0–L1 | Yes | — |
| L2 | `@file` / assigned Agent only | tracked MD · chat paste |
| L3 | No | L2 in summaries |

- Bank accounts / personal addresses: **`bank_account_id` / `stakeholder_id` links only**
- Transfers: **`orgos broker transfer`** — never paste account numbers in chat
- Wire between orgs: CEO/approver · `protocol notice approve`

When in doubt, read [operator-policy.md](../operator-policy.md) before mutating data or outputting values.

