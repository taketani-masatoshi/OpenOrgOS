# Production enablement checklist

Canonical: `steward/jurisdiction-packs/JP/modules/jp_etax/production-gate.yaml`  
Definition: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) D1–D8 · [CERTIFICATION_CHECKLIST.md](CERTIFICATION_CHECKLIST.md)

Repo tip keeps every requirement **false**. Flip requirements and evidence by human edit after NTA test.
Flip `production_submission_enabled` **only** via release CLI (not `enable`).

```bash
orgos etax production review --json
orgos etax production enable    # always refused
orgos etax production release --approval-id APR-...   # after granted etax.production_enable + requirements true
```

- [ ] KSK2 spec registered (every required CAB hashed)
- [ ] Official XSD validation proven in CI
- [ ] Integration tests passed (test transport, not production)
- [ ] NTA transmission test completed + evidence path (file must exist)
- [ ] Production credentials configured (gitignored, separate from test)
- [ ] OpenOrgOS human approval recorded (ADR 0038, `etax.production_enable`)
- [ ] `production_feature_gate_released` + `production_submission_enabled` via `production release`

`ORGOS_ETAX_PRODUCTION=1` does **not** satisfy this list.

ToS / commercial copy that currently says e-Tax提出を含まない must be updated in a **separate PR** only when `certified === true` (対応完了宣言と同時). Do not update ToS early.

Implementation-100 (mock) ≠ e-Tax対応完了. Certification requires COM host bind + NTA evidence + production release.
