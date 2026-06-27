# Wire governance thresholds (National layer)

Jurisdiction-specific approval authority for inter-org wire outbound.

- **Core:** `schemas/protocol/wire-approval.ts` — `WireApprovalTier` A/B/C
- **National:** this file — amounts, currency, `policy_ref` (REG-*-004), approver roles
- **Runtime:** `src/lib/jurisdiction/wire-governance/`

Add a jurisdiction block under `jurisdictions:` or extend an existing pack (JP, US, HK, …).
