import { validateTrustedHubsRegistry } from "./trusted-hubs.js";
import {
  checkRevocationSla,
  loadTrustedOperatorsRegistry,
  validateTrustedOperatorsRegistry,
} from "./trusted-operators.js";
import {
  loadCommunityIntegration,
  resolveCommunityReadinessCap,
} from "./eco-production-evidence.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot, getDeployDir, getSchemasDir } from "../orgos-paths.js";
import { STEWARD_PLATFORM_DIR } from "../steward-paths.js";

export interface CommunityReadiness {
  score: number;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
}

/** Steward-side C4 readiness — cap via resolveCommunityReadinessCap() (95 / 98 / 99). */
export function computeCommunityReadiness(): CommunityReadiness {
  const checks: CommunityReadiness["checks"] = [];
  let score = 45;

  const ops = validateTrustedOperatorsRegistry();
  checks.push({
    id: "trusted-operators-registry",
    ok: ops.ok,
    detail: ops.ok ? "registry valid" : `${ops.issues.length} issue(s)`,
  });
  if (ops.ok) score += 10;

  const reg = loadTrustedOperatorsRegistry();
  const slaConfigured = reg.revocation_sla.max_hours > 0 && reg.revocation_sla.escalation_hours > 0;
  checks.push({
    id: "revocation-sla-configured",
    ok: slaConfigured,
    detail: slaConfigured
      ? `max ${reg.revocation_sla.max_hours}h · escalate ${reg.revocation_sla.escalation_hours}h`
      : "missing SLA policy",
  });
  if (slaConfigured) score += 5;

  const slaCheck = checkRevocationSla();
  checks.push({
    id: "revocation-sla-current",
    ok: slaCheck.ok,
    detail: slaCheck.ok ? "no overdue revocations" : `${slaCheck.overdue.length} overdue`,
  });
  if (slaCheck.ok) score += 5;

  const activeOps = reg.operators.filter((o) => o.status === "active").length;
  checks.push({
    id: "governance-operators",
    ok: activeOps > 0,
    detail: `${activeOps} active operator(s) · committee ${reg.committee_id}`,
  });
  if (activeOps > 0) score += 5;

  const hubs = validateTrustedHubsRegistry();
  checks.push({
    id: "trusted-hubs-registry",
    ok: hubs.ok,
    detail: hubs.ok ? "trusted-hubs OK" : `${hubs.issues.length} issue(s)`,
  });
  if (hubs.ok) score += 5;

  const bundleSchemaPath = join(getSchemasDir(), "protocol/witness-trust.ts");
  const hasRevocations = existsSync(bundleSchemaPath);
  checks.push({
    id: "witness-trust-revocations",
    ok: hasRevocations,
    detail: "revocation list in trust bundle schema",
  });
  if (hasRevocations) score += 5;

  const ciList = join(STEWARD_PLATFORM_DIR, "protocol", "ci-validate-tenants.yaml");
  checks.push({
    id: "ci-protocol-validate-tenants",
    ok: existsSync(ciList),
    detail: "all demo tenants protocol validate in CI",
  });
  if (existsSync(ciList)) score += 3;

  const deployPerms = join(getDeployDir(), "protocol-outbox/apply-permissions.sh");
  checks.push({
    id: "deploy-outbox-permissions",
    ok: existsSync(deployPerms),
    detail: "OS-level outbox hardening template",
  });
  if (existsSync(deployPerms)) score += 3;

  checks.push({
    id: "peer-protocol-policy",
    ok: existsSync(join(getInstallRoot(), "src/lib/protocol/peer-protocol-policy.ts")),
    detail: "contract protocol: peer whitelist",
  });
  if (existsSync(join(getInstallRoot(), "src/lib/protocol/peer-protocol-policy.ts"))) score += 2;

  checks.push({
    id: "orgos-readiness-engine",
    ok: existsSync(join(getInstallRoot(), "src/lib/protocol/orgos-readiness.ts")),
    detail: "dynamic OrgOS scoring",
  });
  if (existsSync(join(getInstallRoot(), "src/lib/protocol/orgos-readiness.ts"))) score += 2;

  checks.push({
    id: "openorgos-core-readiness",
    ok: existsSync(join(getInstallRoot(), "src/lib/protocol/openorgos-core-readiness.ts")),
    detail: "Core four-element scoring",
  });
  if (existsSync(join(getInstallRoot(), "src/lib/protocol/openorgos-core-readiness.ts")))
    score += 2;

  checks.push({
    id: "orgos-99-plan",
    ok: existsSync(join(getInstallRoot(), "docs/org-os/orgos-99-plan.md")),
    detail: "99-point improvement plan published",
  });
  if (existsSync(join(getInstallRoot(), "docs/org-os/orgos-99-plan.md"))) score += 1;

  checks.push({
    id: "wire-score-98-tickets",
    ok: existsSync(join(getInstallRoot(), "docs/org-os/wire-score-98-tickets.md")),
    detail: "Wire 98+ ticket backlog published",
  });
  if (existsSync(join(getInstallRoot(), "docs/org-os/wire-score-98-tickets.md"))) score += 1;

  checks.push({
    id: "mal-wire-operator-setup",
    ok: existsSync(join(getInstallRoot(), "scripts/setup-mal-wire-operator.sh")),
    detail: "mal Wire operator bootstrap script",
  });
  if (existsSync(join(getInstallRoot(), "scripts/setup-mal-wire-operator.sh"))) score += 1;

  checks.push({
    id: "mal-wire-pilot-gate-test",
    ok: existsSync(join(getInstallRoot(), "tests/mal-wire-pilot-gate.test.ts")),
    detail: "mal production wire gate CI test",
  });
  if (existsSync(join(getInstallRoot(), "tests/mal-wire-pilot-gate.test.ts"))) score += 1;

  checks.push({
    id: "community-protocol-export",
    ok: existsSync(join(getInstallRoot(), "src/lib/protocol/community-export.ts")),
    detail: "community read bundle export",
  });
  if (existsSync(join(getInstallRoot(), "src/lib/protocol/community-export.ts"))) score += 1;

  checks.push({
    id: "steward-community-vocabulary",
    ok: existsSync(join(getInstallRoot(), "docs/org-os/steward-community-vocabulary.md")),
    detail: "Steward-Community vocabulary map",
  });
  if (existsSync(join(getInstallRoot(), "docs/org-os/steward-community-vocabulary.md"))) score += 1;

  const integration = loadCommunityIntegration();
  const integrationOk =
    integration?.community_ui === true &&
    integration?.sla_dashboard === true &&
    integration?.lifecycle_page === true &&
    integration?.trusted_operators_page === true &&
    integration?.governance_api === true &&
    integration?.e2e_green === true;
  checks.push({
    id: "community-integration-flags",
    ok: integrationOk,
    detail: integrationOk ? "Community UI + e2e verified" : "community-integration.json incomplete",
  });
  if (integrationOk) score += 2;

  const wireTrustPublish = existsSync(
    join(getInstallRoot(), "publish/protocol/wire-trust-registry.yaml")
  );
  checks.push({
    id: "wire-trust-registry-publish",
    ok: wireTrustPublish,
    detail: "wire-trust-registry.yaml in publish/protocol/",
  });
  if (wireTrustPublish) score += 1;

  const jurisdictionUi = integration?.jurisdiction_registry_ui === true;
  checks.push({
    id: "jurisdiction-registry-ui",
    ok: jurisdictionUi,
    detail: jurisdictionUi ? "Community /protocol/jurisdiction live" : "C4-W6 UI pending",
  });
  if (jurisdictionUi) score += 1;

  const vocabularyI18n = integration?.vocabulary_i18n === true;
  checks.push({
    id: "vocabulary-i18n",
    ok: vocabularyI18n,
    detail: vocabularyI18n
      ? "Steward-Community vocabulary · 8 locale"
      : "protocol-vocabulary i18n pending",
  });
  if (vocabularyI18n) score += 1;

  const tenantMailShipped = integration?.tenant_mail_connect_api === true;
  checks.push({
    id: "tenant-mail-connect-api",
    ok: tenantMailShipped,
    detail: tenantMailShipped
      ? "Community tenant-mail API export + Steward push route"
      : "deferred — Gmail tenant-mail connect not shipped (scaffold only)",
  });
  if (tenantMailShipped) score += 1;

  const cap = resolveCommunityReadinessCap();
  return { score: Math.min(score, cap), checks };
}
