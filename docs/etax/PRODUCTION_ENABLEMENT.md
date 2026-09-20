# Production enablement checklist

All items are **false** in Phase 1. Flip only in Phase 8 after human review.

Canonical: `steward/jurisdiction-packs/JP/modules/jp_etax/production-gate.yaml`

- [ ] KSK2 spec registered (every required CAB hashed)
- [ ] Official XSD validation proven in CI
- [ ] Integration tests passed (test transport, not production)
- [ ] NTA transmission test completed + evidence path
- [ ] Production credentials configured (gitignored, separate from test)
- [ ] OpenOrgOS human approval recorded (ADR 0038, hash-bound)
- [ ] `production_submission_enabled: true` after review

`ORGOS_ETAX_PRODUCTION=1` does **not** satisfy this list.
