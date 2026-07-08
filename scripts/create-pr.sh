#!/usr/bin/env bash
# Create PR for cursor/steward-os-mvp-and-reports → main
# Prerequisites: gh auth login · git remote add origin <url>
set -euo pipefail
cd "$(dirname "$0")/.."

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "error: no git remote 'origin'. Example:"
  echo "  git remote add origin git@github.com:ORG/OS_Steward.git"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: run 'gh auth login' first"
  exit 1
fi

BRANCH="${1:-cursor/steward-os-mvp-and-reports}"
BASE="${2:-main}"

git push -u origin "HEAD:${BRANCH}"

gh pr create --base "$BASE" --head "$BRANCH" --title "OrgOS reference: guardrails, dual scoring, CLI rename, and doc sync" --body "$(cat <<'EOF'
## Summary

- **Protocol guardrails:** outbox write guard, pre-deliver validate, peer whitelist, outbox permissions deploy, company-events lint, and `validate:protocol:tenants` CI for all demo tenants.
- **OrgOS dual scoring:** checklist (artifact/CI) vs strict (operational caps); `status --orgos` shows both OrgOS and OpenOrgOS Core scores.
- **Strict 99 roadmap:** documents Steward-side ceilings (checklist max 99, strict ~91 without OS_Community) in `docs/org-os/orgos-strict-99-roadmap.md`.
- **Core strict ↔ npm test:** `.orgos-ci/test-suite.json` marker — unverified 92 · failed 85 · passed follows checklist (100).
- **Product rename:** npm `orgos-reference`, CLI `orgos`, `ORGOS_TENANT` env; legacy `steward` alias with deprecation warning.
- **Docs:** OrgOS vocabulary, terminology batch (`npm run orgos`), cursor rules, runbooks.

## Commits (review order)

1. `feat(protocol):` guardrails + CI tenant validate
2. `feat(orgos):` dual scoring + test-suite linkage
3. `refactor(cli):` orgos-reference rename
4. `docs:` vocabulary + batch terminology

## Test plan

- [x] `npm test` — 493 tests
- [x] `npm run check`
- [x] `npm run orgos -- status --orgos` — checklist 99 · strict 91 · Core strict 100 after test
- [x] `npm run validate:protocol:tenants`
- [ ] Deploy: systemd units use `npm run orgos` and `/opt/orgos-reference`

EOF
)"
