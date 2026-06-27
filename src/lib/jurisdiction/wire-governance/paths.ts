import { join, resolve } from "node:path";
import { ROOT_DIR } from "../../tenant.js";

const WIRE_GOVERNANCE_DIR = join(ROOT_DIR, "steward", "jurisdiction-packs", "wire-governance");

/** National layer registry — maps jurisdiction code → pack file + pin. */
export function getWireGovernanceRegistryPath(): string {
  return join(WIRE_GOVERNANCE_DIR, "registry.yaml");
}

/** @deprecated Use getWireGovernanceRegistryPath + pack resolution */
export function getWireGovernanceThresholdsPath(): string {
  return join(WIRE_GOVERNANCE_DIR, "approval-thresholds.yaml");
}

export function resolveWireGovernancePackPath(relativePath: string): string {
  return resolve(WIRE_GOVERNANCE_DIR, relativePath);
}

export function getWireGovernanceDir(): string {
  return WIRE_GOVERNANCE_DIR;
}
