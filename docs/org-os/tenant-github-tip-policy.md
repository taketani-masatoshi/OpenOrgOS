# Tenant tip policy (OpenOrgOS)

History rewrite is out of scope. This document defines what may remain on the **current tip**.

## Allowed on tip

| Class | Examples | Notes |
|-------|----------|--------|
| Template / fixture | `tenants/_template/`, `tenants/_fixture-books/` | No real secrets |
| Product demo / CI seeds | `*-demo`, `demo`, `pilot-ledger-*`, `acme`, `aiac`, `southwood`, `mal`, `sample-co`, `wire-console-test` | Operational secrets and runtime stay gitignored |
| Demo / CI fixture ledgers | `tenants/{demo,*-demo,demo-signup-*,acme,pilot-ledger-*}/data/finance/payroll.yaml` | Stub values only. The gates validate these tenants, so they must stay on tip |
| Examples | `*.example`, `*.example.yaml` | OK |

`mal` / `aiac` / `southwood` are **product reference tenants** for tests and docs, not a license to commit secrets.

## Forbidden on tip (gitignore + untrack)

- `*.pem` / signing keys / real `.env`
- Chat threads / command-plans / tower-plans
- `payroll.yaml`, bank accounts, payroll-detail, records vaults
- Generated company artifacts, audit-bridge-state, protocol runtime

If a path matches `.gitignore` but is still tracked, run `git rm --cached` (no history rewrite).

## Enforcement

| Layer | Command |
|-------|---------|
| Local hook | `scripts/install-hooks.sh` once per clone, then `pre-commit` / `pre-push` |
| Manual | `npm run check:tenant-tip` |
| CI | `validate` workflow runs `check:tenant-tip` before the other gates |

The check fails on gitignored-but-tracked paths, key material, chat/records runtime, and finance ledgers outside `_template` / `_fixture-books`.

## Gates must not depend on a real tenant

`getTenantId()` no longer falls back to a hardcoded tenant id. CI pins `ORGOS_TENANT=demo` for `npm run check`, so a fresh clone never validates an operator's real tenant.

A test that needs a real tenant's local-only data must skip when that data is absent — see `tests/finance-accounting.test.ts`.

## Local-only

Live operator data belongs on the machine under the active tenant workspace. Do not promote it to GitHub.
