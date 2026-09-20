# e-Tax operator manual

**EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION**

## What this module is

`jp_etax` talks to NTA e-Tax **after** tax calculation. It does not replace `orgos tax` or advisor handoff.

## Daily commands

```bash
orgos etax spec status
orgos etax status
```

Expect the banner:

```text
e-Tax production submission: NOT CERTIFIED / DISABLED
```

## What not to do

- Do not submit the `not-for-etax` corporate tax XML draft.
- Do not pass PINs or private keys on the CLI.
- Do not set an environment variable and assume production is on.
- Do not enable `jp_etax` on a tenant to “raise readiness scores”.
