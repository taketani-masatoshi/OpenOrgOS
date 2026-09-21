# e-Tax migration / rollback

## Install (Phase 1)

- Catalog module `jp_etax` is present but **not** enabled on `mal`.
- No tenant data migration is required.
- Existing `submission: not-for-etax` packages stay advisor handoff.

## Rollback

1. Leave `production-gate.yaml` with `production_submission_enabled: false` (default).
2. Disable the module in tenant `modules.yaml` if it was enabled.
3. Do not delete audit JSONL.
4. Tax-calc modules are unchanged; rollback of `jp_etax` cannot break GL or handoff.

## Forward

Enabling production is Phase 8 only, with the production enablement checklist.
