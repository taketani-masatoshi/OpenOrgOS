/**
 * OrgOS readiness — checklist (artifact) scoring for framework-assessment §13.
 * For operational score use orgos-readiness-strict.ts · orgos-scoring-methodology.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getInstallRoot, getDeployDir, getSchemasDir } from "../orgos-paths.js";
import { JURISDICTION_PACKS_DIR } from "../steward-paths.js";
import { computeModuleAxisStats } from "../extensibility-contract.js";
import { computeCommunityReadiness } from "./community-readiness.js";

export interface ReadinessCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface OrgOsAxisReadiness {
  score: number;
  checks: ReadinessCheck[];
}

export interface OrgOsReadinessReport {
  standaloneLoop: OrgOsAxisReadiness;
  formUnification: OrgOsAxisReadiness;
  interfaceAxis: OrgOsAxisReadiness;
  wireEvidence: OrgOsAxisReadiness;
  ecosystem: OrgOsAxisReadiness;
  weighted: number;
  gaps: string[];
}

function bucketScore(checks: ReadinessCheck[]): OrgOsAxisReadiness {
  if (checks.length === 0) return { score: 0, checks };
  const passed = checks.filter((c) => c.ok).length;
  return { score: Math.round((passed / checks.length) * 100), checks };
}

function fileOk(relativePath: string, detail = "present"): ReadinessCheck {
  const path = join(getInstallRoot(), relativePath);
  return { id: relativePath, ok: existsSync(path), detail: existsSync(path) ? detail : "missing" };
}

function ciValidateTenantCount(): number {
  const path = join(getInstallRoot(), "steward/platform/protocol/ci-validate-tenants.yaml");
  if (!existsSync(path)) return 0;
  const doc = YAML.parse(readFileSync(path, "utf-8")) as { tenants?: string[] };
  return doc.tenants?.length ?? 0;
}

function computeStandaloneLoopChecks(): ReadinessCheck[] {
  return [
    fileOk("scripts/lib/standalone-org-demo.ts", "standalone demo script"),
    fileOk("tests/standalone-org-demo.test.ts", "standalone demo test"),
    fileOk("src/lib/protocol/protocol-write-guard.ts", "outbox write guard"),
    fileOk("src/lib/protocol/pre-deliver-gate.ts", "pre-deliver validate gate"),
    fileOk("deploy/protocol-outbox/apply-permissions.sh", "deploy outbox permissions"),
    fileOk("src/lib/org/audit-bridge.ts", "operational audit bridge"),
    {
      id: "ci-validate-tenants",
      ok: ciValidateTenantCount() >= 15,
      detail: `${ciValidateTenantCount()} tenants in ci-validate-tenants.yaml`,
    },
    fileOk("package.json", "demo:mal-standalone in package.json"),
  ].map((c) =>
    c.id === "package.json"
      ? {
          ...c,
          ok: existsSync(join(getInstallRoot(), "package.json")) &&
            readFileSync(join(getInstallRoot(), "package.json"), "utf-8").includes("demo:mal-standalone"),
        }
      : c
  );
}

function computeFormUnificationChecks(): ReadinessCheck[] {
  return [
    fileOk("src/lib/protocol/witness-envelope-emit.ts", "witness emit on chain"),
    fileOk("tests/protocol-witness-integration.test.ts", "witness integration E2E"),
    fileOk("src/lib/protocol/outbox-provenance.ts", "outbox provenance"),
    fileOk("src/lib/company-events-lint.ts", "company event MD lint"),
    fileOk("tests/org-audit-bridge.test.ts", "audit bridge tests"),
    fileOk("tests/protocol-external-verify.test.ts", "external verify"),
    fileOk("docs/org-os/orgos-interface-spec.md", "I1/I2/I3 interface spec"),
  ];
}

function computeWireEvidenceChecks(): ReadinessCheck[] {
  return [
    fileOk("tests/protocol-deliver-pull.test.ts", "deliver-pull E2E"),
    fileOk("scripts/demo-mesh-deliver.ts", "mesh deliver demo"),
    fileOk("scripts/seed-inter-org-demo.ts", "inter-org demo"),
    fileOk("src/lib/protocol/protocol-api-server.ts", "peer outbox/inbox export API"),
    fileOk("src/lib/protocol/witness-reconcile.ts", "witness reconcile + remote ledger"),
    fileOk("src/lib/protocol/peer-protocol-policy.ts", "contract peer whitelist"),
    fileOk("tests/protocol-peer-policy.test.ts", "peer policy tests"),
    fileOk("docs/runbook-orgos.md", "runbook §16–17 guardrails"),
  ];
}

function computeInterfaceAxisChecks(): ReadinessCheck[] {
  const moduleAxis = computeModuleAxisStats();
  return [
    {
      id: "module-production-ready",
      ok: moduleAxis.productionPct >= 88,
      detail: `${moduleAxis.productionPct}% production_ready (${moduleAxis.productionReady}/${moduleAxis.total})`,
    },
    fileOk("docs/org-os/orgos-interface-spec.md", "interface spec published"),
    fileOk("src/lib/extensibility-contract.ts", "manifest / pack contract check"),
    {
      id: "jurisdiction-packs",
      ok: existsSync(join(JURISDICTION_PACKS_DIR, "JP/pack.manifest.yaml")),
      detail: "JP pack.manifest.yaml",
    },
  ];
}

function interfaceAxisScore(checks: ReadinessCheck[]): number {
  const moduleAxis = computeModuleAxisStats();
  let base =
    moduleAxis.productionPct >= 93
      ? 98
      : moduleAxis.productionPct >= 89
        ? 95
        : moduleAxis.productionPct >= 88
          ? 92
          : 60;
  const passed = checks.filter((c) => c.ok).length;
  const ratio = checks.length ? passed / checks.length : 0;
  if (ratio < 1) base = Math.min(base, Math.round(base * ratio));
  return base;
}

export function computeOrgOsReadiness(): OrgOsReadinessReport {
  const standaloneChecks = computeStandaloneLoopChecks();
  const formChecks = computeFormUnificationChecks();
  const wireChecks = computeWireEvidenceChecks();
  const interfaceChecks = computeInterfaceAxisChecks();
  const community = computeCommunityReadiness();

  const standaloneLoop = bucketScore(standaloneChecks);
  const formUnification = bucketScore(formChecks);
  const wireEvidence = bucketScore(wireChecks);
  const interfaceAxis = {
    score: interfaceAxisScore(interfaceChecks),
    checks: interfaceChecks,
  };
  const ecosystem = {
    score: community.score,
    checks: community.checks.map((c) => ({ id: c.id, ok: c.ok, detail: c.detail })),
  };

  const weighted = Math.round(
    standaloneLoop.score * 0.35 +
      formUnification.score * 0.25 +
      interfaceAxis.score * 0.15 +
      wireEvidence.score * 0.15 +
      ecosystem.score * 0.1
  );

  const gaps: string[] = [];
  for (const [label, axis] of [
    ["単独閉ループ", standaloneLoop],
    ["形式統一", formUnification],
    ["Wire 証拠", wireEvidence],
  ] as const) {
    const failed = axis.checks.filter((c) => !c.ok);
    if (failed.length) gaps.push(`${label}: ${failed.map((f) => f.id).join(", ")}`);
  }
  if (interfaceAxis.score < 98) {
    gaps.push(`インターフェース ${interfaceAxis.score}% — module production_ready 93%+ で 98`);
  }
  if (ecosystem.score < 99) {
    gaps.push(`エコシステム ${ecosystem.score}% — OS_Community UI で 99+（Steward-side cap 95）`);
  }

  return {
    standaloneLoop,
    formUnification,
    interfaceAxis,
    wireEvidence,
    ecosystem,
    weighted,
    gaps,
  };
}
