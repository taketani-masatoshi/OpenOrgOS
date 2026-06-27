import YAML from "yaml";
import { readFileSync } from "node:fs";
import {
  jurisdictionWireGovernanceRegistrySchema,
  type JurisdictionApprovalPolicy,
} from "../../../../schemas/jurisdiction/wire-governance.js";
import { loadTenantConfig } from "../../tenant.js";
import { getWireGovernanceThresholdsPath } from "./paths.js";

let cachedRegistry: ReturnType<typeof jurisdictionWireGovernanceRegistrySchema.parse> | undefined;

function loadWireGovernanceRegistry() {
  if (cachedRegistry) return cachedRegistry;
  cachedRegistry = jurisdictionWireGovernanceRegistrySchema.parse(
    YAML.parse(readFileSync(getWireGovernanceThresholdsPath(), "utf-8"))
  );
  return cachedRegistry;
}

export function resolveJurisdictionApprovalPolicy(): JurisdictionApprovalPolicy {
  const tenant = loadTenantConfig();
  const code = tenant.jurisdiction ?? "JP";
  const registry = loadWireGovernanceRegistry();
  return registry.jurisdictions[code] ?? registry.jurisdictions.default!;
}

export function clearWireGovernanceCacheForTests(): void {
  cachedRegistry = undefined;
}
