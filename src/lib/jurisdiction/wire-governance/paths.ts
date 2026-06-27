import { join } from "node:path";
import { ROOT_DIR } from "../../tenant.js";

/** National layer — jurisdiction-specific wire governance thresholds. */
export function getWireGovernanceThresholdsPath(): string {
  return join(ROOT_DIR, "steward", "jurisdiction-packs", "wire-governance", "approval-thresholds.yaml");
}
