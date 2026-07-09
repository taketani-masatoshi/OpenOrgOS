/**
 * Community protocol read bundle — publish mirror for OS_Community (S-E4).
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeCommunityReadiness } from "./community-readiness.js";
import { checkRevocationSla, loadTrustedOperatorsRegistry } from "./trusted-operators.js";
import {
  computeEcoProductionEvidence,
  resolveCommunityReadinessCap,
} from "./eco-production-evidence.js";
import { getInstallRoot } from "../orgos-paths.js";
import { STEWARD_PLATFORM_DIR } from "../steward-paths.js";

export type CommunityExportResult = {
  dest: string;
  files: string[];
};

export function exportCommunityProtocolBundle(root = getInstallRoot()): CommunityExportResult {
  const dest = join(root, "publish", "protocol");
  mkdirSync(dest, { recursive: true });
  const files: string[] = [];

  const operatorsSrc = join(STEWARD_PLATFORM_DIR, "protocol", "trusted-operators.yaml");
  const operatorsDest = join(dest, "trusted-operators.yaml");
  copyFileSync(operatorsSrc, operatorsDest);
  files.push("trusted-operators.yaml");

  const wireTrustSrc = join(STEWARD_PLATFORM_DIR, "protocol", "wire-trust-registry.yaml");
  if (existsSync(wireTrustSrc)) {
    copyFileSync(wireTrustSrc, join(dest, "wire-trust-registry.yaml"));
    files.push("wire-trust-registry.yaml");
  }

  const readiness = computeCommunityReadiness();
  const readinessCap = resolveCommunityReadinessCap(root);
  writeFileSync(
    join(dest, "community-readiness.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        score: readiness.score,
        steward_side_cap: readinessCap,
        strict_cap_base: 80,
        checks: readiness.checks,
      },
      null,
      2
    ),
    "utf-8"
  );
  files.push("community-readiness.json");

  const sla = checkRevocationSla();
  const registry = loadTrustedOperatorsRegistry();
  writeFileSync(
    join(dest, "community-sla.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        ok: sla.ok,
        policy: registry.revocation_sla,
        overdue: sla.overdue,
        active_operators: registry.operators.filter((o) => o.status === "active").length,
        pending_governance: registry.governance_requests.filter((r) => r.status === "pending").length,
      },
      null,
      2
    ),
    "utf-8"
  );
  files.push("community-sla.json");

  const integrationPath = join(dest, "community-integration.json");
  const existing = existsSync(integrationPath)
    ? (JSON.parse(readFileSync(integrationPath, "utf-8")) as Record<string, unknown>)
    : {};
  writeFileSync(
    integrationPath,
    JSON.stringify(
      {
        ...existing,
        steward_export: true,
        steward_export_at: new Date().toISOString(),
        readiness_score: readiness.score,
      },
      null,
      2
    ),
    "utf-8"
  );
  files.push("community-integration.json");

  return { dest, files };
}
