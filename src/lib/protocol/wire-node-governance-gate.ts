import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadWireTrustRegistry } from "./wire-trust-registry.js";
import { wireNodeGovernanceRegistrySchema } from "../../../schemas/protocol/wire-node-governance.js";
import { isWireNodeGovernanceRequired } from "../../../schemas/protocol/openorg-did.js";
import { STEWARD_PLATFORM_DIR } from "../steward-paths.js";
import { readYamlFile } from "../utils.js";

const GOVERNANCE_PATH = join(STEWARD_PLATFORM_DIR, "protocol", "wire-node-governance.yaml");

export function isTenantInWireTrustRegistry(tenantId: string): boolean {
  const trust = loadWireTrustRegistry();
  return trust.nodes.some(
    (n) =>
      n.node_uri === `steward://tenant/${tenantId}` ||
      n.node_id === tenantId ||
      n.did === `did:ooo:org:${tenantId}`
  );
}

/** pin-local / direct registry key pin requires committee-approved node (unless bypass). */
export function assertPinLocalGovernanceApproved(
  tenantId: string,
  opts?: { bypass?: boolean }
): void {
  if (opts?.bypass || process.env.ORGOS_BYPASS_GOVERNANCE === "1") {
    return;
  }
  if (!isWireNodeGovernanceRequired()) {
    return;
  }
  if (isTenantInWireTrustRegistry(tenantId)) {
    return;
  }
  const governance = existsSync(GOVERNANCE_PATH)
    ? readYamlFile(GOVERNANCE_PATH, wireNodeGovernanceRegistrySchema)
    : wireNodeGovernanceRegistrySchema.parse({ version: "1", governance_requests: [] });
  const approved = governance.governance_requests.some(
    (r) => r.tenant_id === tenantId && r.status === "approved"
  );
  if (approved) {
    return;
  }
  throw new Error(
    `pin-local blocked: tenant ${tenantId} not in wire-trust-registry — ` +
      `run: orgos protocol trust-registry submit --tenant ${tenantId} && decide --approve`
  );
}
