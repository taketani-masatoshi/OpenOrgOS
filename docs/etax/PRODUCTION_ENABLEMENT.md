# Production enablement checklist

All items remain **false**. Flip only after a human Phase 8 review **and** NTA transmission evidence. CLI cannot flip this file.

Canonical: `steward/jurisdiction-packs/JP/modules/jp_etax/production-gate.yaml`

```bash
orgos etax production review
orgos etax production enable   # always refused until the catalog gate is true
```

- [ ] KSK2 spec registered (every required CAB hashed)
- [ ] Official XSD validation proven in CI
- [ ] Integration tests passed (test transport, not production)
- [ ] NTA transmission test completed + evidence path (file must exist)
- [ ] Production credentials configured (gitignored, separate from test)
- [ ] OpenOrgOS human approval recorded (ADR 0038, hash-bound)
- [ ] `production_submission_enabled: true` after review

`ORGOS_ETAX_PRODUCTION=1` does **not** satisfy this list.

Implementation-100 (mock path) ≠ e-Tax対応完了. Certification requires COM host bind + NTA evidence.
