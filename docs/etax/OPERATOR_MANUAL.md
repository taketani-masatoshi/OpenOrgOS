# e-Tax operator manual

**EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION**  
**Not e-Tax対応完了.** See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) · [HOST_CONTRACT.md](./HOST_CONTRACT.md).

## What this module is

`jp_etax` talks to NTA e-Tax **after** tax calculation. It does not replace `orgos tax` or advisor handoff.

First procedure: **RHO0010** (普通法人の確定申告・青色) — `EXPERIMENTAL`, not production-eligible.

## Daily commands

```bash
orgos etax spec status
orgos etax production review
orgos etax status
```

Mock filing path (local only):

```bash
orgos etax build --from return-package.json
orgos etax validate <submission-id>
orgos etax approve-propose <submission-id>
orgos etax approve <submission-id> --approval-id APR-...
orgos etax sign <submission-id> --env mock --xml data/etax/generated/<id>.xml
orgos etax ready <submission-id> --env mock
orgos etax submit <submission-id> --env mock --xml data/etax/generated/<id>.xml
orgos etax receipt <submission-id> --env mock
```

Expect the banner:

```text
e-Tax production submission: NOT CERTIFIED / DISABLED
```

## What not to do

- Do not submit the `not-for-etax` corporate tax XML draft.
- Do not treat `--env mock` signatures or receipts as legal e-Tax filings (`legal: false`, `MOCK-NOT-NTA-` prefix).
- Do not pass PINs or private keys on the CLI (`orgos etax sign` has no `--password`).
- Do not set an environment variable and assume production is on.
- Do not run `orgos etax production enable` expecting it to flip the catalog gate — it is refused.
- Do not enable `jp_etax` on a tenant to “raise readiness scores”.

Official signing uses the NTA module (Windows COM `nta.CLCXtxSigner.SignToReport` or macOS `CLISignature.SignToReport`) on the device. Official send/receive uses `nta.CLCCommunication.Send`. Native hosts are not bound (`SPEC_BLOCKED`).

Approval: `orgos etax approve-propose` then `orgos etax approve --approval-id APR-...` (ceo/approver, hash-bound, ADR 0038). Self-approval is forbidden. `org approval approve` also applies the etax submission (rollback if apply fails).
