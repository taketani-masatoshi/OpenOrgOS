# Local test evidence (implementation-100)

NTA transmission test: **not run**. Production: **disabled**.  
Do not treat green local tests as e-Tax対応完了.

## Coverage

- Phase 1–3: hash, XSD engine, signature catalog, mock signature
- Phase 4–8 unit: transport catalog, mock transport, hash-bound approval helpers
- **Lifecycle E2E** (`tests/etax-lifecycle-e2e.test.ts`): RHO0010 official XML from mapping → XSD pass → mock RECEIVED_BY_ETAX **without hand-written xmlHash of invented XML**
- Contract: `READY_TO_SUBMIT → TRANSPORT_ERROR`, required CAB disk SHA checks, production review uncertified

```bash
ORGOS_TEST_DISPOSABLE_ROOT=$PWD npx vitest run \
  tests/etax-phase1.test.ts \
  tests/etax-phase2.test.ts \
  tests/etax-phase3.test.ts \
  tests/etax-phase4-8.test.ts \
  tests/etax-lifecycle-e2e.test.ts \
  tests/catalog/jp-etax.test.ts
```

`RECEIVED_BY_ETAX` is not tax-correctness. Mock receipts are not NTA 受付番号.
