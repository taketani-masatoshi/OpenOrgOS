import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import {
  DEFAULT_GOVERNANCE_POLICY,
  governancePolicySchema,
  type AuthorityProfile,
  type GovernancePolicy,
} from "../../../schemas/org/governance-policy.js";
import { getTenantId, tenantDataPath } from "../tenant.js";

let cachedTenant: string | undefined;
let cached: GovernancePolicy | undefined;

export function governancePolicyPath(): string {
  return tenantDataPath("org", "governance-policy.yaml");
}

export function clearGovernancePolicyCacheForTests(): void {
  cachedTenant = undefined;
  cached = undefined;
}

export function loadGovernancePolicy(): GovernancePolicy {
  const tenantId = getTenantId();
  if (cached && cachedTenant === tenantId) return cached;
  const path = governancePolicyPath();
  if (!existsSync(path)) {
    cachedTenant = tenantId;
    cached = DEFAULT_GOVERNANCE_POLICY;
    return cached;
  }
  const parsed = governancePolicySchema.parse(YAML.parse(readFileSync(path, "utf-8")));
  cachedTenant = tenantId;
  cached = parsed;
  return parsed;
}

export function getAuthorityProfile(): AuthorityProfile {
  return loadGovernancePolicy().authority_profile;
}

export function isCeoConcentratedProfile(): boolean {
  return getAuthorityProfile() === "ceo_concentrated";
}
