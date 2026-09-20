# Local test evidence (Phase 3)

NTA transmission test: **not run**.

Phase 1 tests (hash, state, gate, redaction) remain.

Phase 2 automated tests cover XSD engine, XXE, mapper fail-closed.

Phase 3 automated tests cover:

- e-tax05 signature catalog (`nta.CLCXtxSigner` / `SignToReport`, `hostBound: false`)
- Mock adapter: hash-bound labeled digest, `legal: false`, no PIN/password in the result
- Official adapter: `SPEC_BLOCKED` when the native COM/ObjC host is unbound (no invented CLI / XML-DSig)
- Mock signatures forbidden outside `--env mock`; production sign remains fail-closed
- APPROVED → SIGNED only when `xmlHash` matches; missing XML / unapproved status refused
- Audit redaction of PIN/password

Command: `npx vitest run tests/etax-phase1.test.ts tests/etax-phase2.test.ts tests/etax-phase3.test.ts tests/catalog/jp-etax.test.ts`

Do not treat green local tests as e-Tax対応完了. Mock signatures are not legal e-Tax signatures.
