# Local test evidence (Phase 1)

NTA transmission test: **not run**.

Phase 1 automated tests cover:

- ReturnPackage canonical hash
- 1-byte payload change invalidates hash
- Illegal status transitions
- Hash mismatch invalidates approval-ready states
- Duplicate identity key
- Production gate fail-closed (including ignored env var)
- Secret redaction
- Spec manifest parses as KSK2-only
- Official XML generator is SPEC_BLOCKED
- Unsupported procedure fail-closed

Command: `npx vitest run tests/etax-phase1.test.ts tests/catalog/jp-etax.test.ts`
