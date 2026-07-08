#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

commit_if_staged() {
  local msg="$1"
  if git diff --cached --quiet; then
    echo "skip (empty): $msg"
    return 0
  fi
  git commit -m "$msg"
  echo "✓ committed: $msg"
}

# --- 1. Guardrails ---
GUARDRAIL_PATHS=(
  deploy/protocol-outbox
  schemas/protocol/outbox-provenance.ts
  src/lib/protocol/protocol-write-guard.ts
  src/lib/protocol/outbox-provenance.ts
  src/lib/protocol/outbox-permissions.ts
  src/lib/protocol/pre-deliver-gate.ts
  src/lib/protocol/peer-protocol-policy.ts
  src/lib/company-events-lint.ts
  scripts/validate-protocol-tenants.ts
  steward/platform/protocol/ci-validate-tenants.yaml
  tests/protocol-write-guard.test.ts
  tests/protocol-peer-policy.test.ts
  tests/protocol-outbox-permissions.test.ts
  tests/company-events-lint.test.ts
  tests/validate-protocol-tenants.test.ts
  tenants/demo/data/company-events.yaml
  tenants/hk-demo/docs/protocol/outbox
  src/lib/protocol/transport.ts
  src/commands/protocol.ts
  src/lib/company-events.ts
  schemas/protocol/contract-protocol.ts
  .github/workflows/validate.yml
)

for p in "${GUARDRAIL_PATHS[@]}"; do
  [ -e "$p" ] && git add "$p"
done

commit_if_staged "feat(protocol): outbox guardrails, pre-deliver validate, and CI tenant checks

Add protocol write guard, peer whitelist, pre-deliver gate, outbox permissions deploy,
company-events lint, and validate:protocol:tenants for all demo tenants."

# --- 2. Scoring ---
SCORING_PATHS=(
  src/lib/protocol/orgos-readiness.ts
  src/lib/protocol/orgos-readiness-strict.ts
  src/lib/protocol/openorgos-core-readiness.ts
  src/lib/protocol/test-suite-status.ts
  src/lib/os-score.ts
  src/commands/status.ts
  scripts/run-tests.ts
  scripts/clear-test-suite-status.ts
  scripts/write-test-suite-passed.ts
  scripts/write-test-suite-failed.ts
  tests/orgos-readiness.test.ts
  tests/test-suite-status.test.ts
  docs/org-os/orgos-scoring-methodology.md
  docs/org-os/orgos-99-plan.md
  docs/org-os/orgos-strict-99-roadmap.md
  steward/platform/orgos-score-baseline.yaml
  docs/framework-assessment.md
  .gitignore
)

for p in "${SCORING_PATHS[@]}"; do
  [ -e "$p" ] && git add "$p"
done

commit_if_staged "feat(orgos): dual scoring, strict 99 roadmap, and npm test CI linkage

Checklist vs strict OrgOS/Core scores, test-suite marker for Core strict cap,
and documented Steward-side ceilings for 99+."

# --- 3. Product rename ---
RENAME_PATHS=(
  src/lib/orgos-cli.ts
  scripts/batch-rename-cli-refs.ts
  docs/org-os/cli-migration.md
  package.json
  package-lock.json
  src/cli.ts
  src/bootstrap-tenant.ts
  src/lib/tenant.ts
  src/lib/tenant-init.ts
  README.md
  deploy/protocol-api/systemd
  deploy/protocol-relay/systemd
  deploy/witness-hub
  tests/cli-branding.test.ts
  tests/skeleton.test.ts
  tests/acme-validate.test.ts
  tests/demo-status.test.ts
  tests/yojitsu-v2.test.ts
  tests/escalate.test.ts
  tests/setup-tenant.ts
  src/commands
  src/cli/registrars
  src/lib/agent-summaries.ts
  src/lib/core-skill-runners.ts
  src/lib/dashboard.ts
  src/lib/data-health.ts
  src/lib/dependency-graph.ts
  src/lib/escalate.ts
  src/lib/context-manifest.ts
  src/lib/maturity.ts
  src/lib/pdf.ts
  src/lib/routing.ts
  src/lib/google-calendar-push.ts
)

for p in "${RENAME_PATHS[@]}"; do
  [ -e "$p" ] && git add "$p"
done

commit_if_staged "refactor(cli): rename product to orgos-reference with legacy steward alias

npm orgos CLI, ORGOS_TENANT env, deploy systemd updates, and batch doc string migration."

# --- 4. Everything else ---
git add -A
commit_if_staged "docs: OrgOS vocabulary, terminology batch, and tenant fixture updates

Sync agent docs, runbooks, cursor rules, orgos-vocabulary, and demo tenant data
with OrgOS product naming and scoring methodology."

echo ""
git log -4 --oneline
git status --short | head -5 || true
