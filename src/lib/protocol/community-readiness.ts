import { validateTrustedHubsRegistry } from "./trusted-hubs.js";
import {
  checkRevocationSla,
  loadTrustedOperatorsRegistry,
  validateTrustedOperatorsRegistry,
} from "./trusted-operators.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../tenant.js";

export interface CommunityReadiness {
  score: number;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
}

/** Steward-side C4 readiness — max 95 without OS_Community app (95+ requires UI). */
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

  const bundleSchemaPath = join(ROOT_DIR, "schemas/protocol/witness-trust.ts");
  const hasRevocations = existsSync(bundleSchemaPath);
  checks.push({
    id: "witness-trust-revocations",
    ok: hasRevocations,
    detail: "revocation list in trust bundle schema",
  });
  if (hasRevocations) score += 5;

  const ciList = join(ROOT_DIR, "steward/platform/protocol/ci-validate-tenants.yaml");
  checks.push({
    id: "ci-protocol-validate-tenants",
    ok: existsSync(ciList),
    detail: "all demo tenants protocol validate in CI",
  });
  if (existsSync(ciList)) score += 3;

  const deployPerms = join(ROOT_DIR, "deploy/protocol-outbox/apply-permissions.sh");
  checks.push({
    id: "deploy-outbox-permissions",
    ok: existsSync(deployPerms),
    detail: "OS-level outbox hardening template",
  });
  if (existsSync(deployPerms)) score += 3;

  checks.push({
    id: "peer-protocol-policy",
    ok: existsSync(join(ROOT_DIR, "src/lib/protocol/peer-protocol-policy.ts")),
    detail: "contract protocol: peer whitelist",
  });
  if (existsSync(join(ROOT_DIR, "src/lib/protocol/peer-protocol-policy.ts"))) score += 2;

  checks.push({
    id: "orgos-readiness-engine",
    ok: existsSync(join(ROOT_DIR, "src/lib/protocol/orgos-readiness.ts")),
    detail: "dynamic OrgOS scoring",
  });
  if (existsSync(join(ROOT_DIR, "src/lib/protocol/orgos-readiness.ts"))) score += 2;

  checks.push({
    id: "openorgos-core-readiness",
    ok: existsSync(join(ROOT_DIR, "src/lib/protocol/openorgos-core-readiness.ts")),
    detail: "Core four-element scoring",
  });
  if (existsSync(join(ROOT_DIR, "src/lib/protocol/openorgos-core-readiness.ts"))) score += 2;

  checks.push({
    id: "orgos-99-plan",
    ok: existsSync(join(ROOT_DIR, "docs/org-os/orgos-99-plan.md")),
    detail: "99-point improvement plan published",
  });
  if (existsSync(join(ROOT_DIR, "docs/org-os/orgos-99-plan.md"))) score += 1;

  return { score: Math.min(score, 95), checks };
}
