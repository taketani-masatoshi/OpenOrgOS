# @orgos/wire

OrgOS Wire — inter-org protocol operator overlay for [@orgos/cli](https://www.npmjs.com/package/@orgos/cli).

This package is a **companion meta-package**. It does not ship Wire Console assets directly; it documents the workflow and verifies that `@orgos/cli` is installed.

## Install

```bash
npm install -g @orgos/cli @orgos/wire
orgos doctor
```

## Quick start

```bash
# Proposal 3 relay + Wire Console SPA (from @orgos/cli install root)
orgos wire setup
orgos wire console build
orgos wire console start    # http://127.0.0.1:9470

# CEO Operator layer (Steward Chat — same session as Wire Console)
orgos chat start            # http://127.0.0.1:9471

# Same-origin combined console (recommended for production)
orgos operator console start   # Chat / + Wire /wire/ on :9470
```

## Combined deployment

Build Wire Console for `/wire/` base path, then start the combined server:

```bash
npm run operator-console:build   # dev repo
orgos operator console start --tenant demo
```

See `docs/operator-production.md` in `@orgos/cli` for HTTPS, session cookies, and MCP auth.

## Peer dependency

Requires `@orgos/cli` at the same major/minor version. `postinstall` prints a reminder if the CLI is missing from PATH.
