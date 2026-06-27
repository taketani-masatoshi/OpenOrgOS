# Wire governance (National layer)

Jurisdiction-specific approval authority for inter-org wire outbound.

| 正本 | 用途 |
|------|------|
| `registry.yaml` | jurisdiction code → pack path + sha256 pin |
| `../JP/wire-governance/approval-thresholds.yaml` | JP · REG-004 |
| `../US/wire-governance/approval-thresholds.yaml` | US · REG-US-004 |
| `../HK/wire-governance/approval-thresholds.yaml` | HK · REG-HK-004 |
| `../_default/wire-governance/approval-thresholds.yaml` | fallback |

- **Core:** `schemas/protocol/wire-approval.ts` — `WireApprovalTier` A/B/C
- **Runtime:** `src/lib/jurisdiction/wire-governance/`

`approval-thresholds.yaml` (monolithic) is **deprecated** — use per-jurisdiction packs + registry.
