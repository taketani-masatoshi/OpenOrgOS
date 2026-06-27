import { createHash } from "node:crypto";
import YAML from "yaml";
import { readFileSync } from "node:fs";
import {
  jurisdictionApprovalPolicySchema,
  jurisdictionWireGovernanceRegistrySchema,
  type JurisdictionApprovalPolicy,
} from "../../../../schemas/jurisdiction/wire-governance.js";
import { loadTenantConfig } from "../../tenant.js";
import {
  getWireGovernanceRegistryPath,
  resolveWireGovernancePackPath,
} from "./paths.js";

let cachedRegistry: ReturnType<typeof jurisdictionWireGovernanceRegistrySchema.parse> | undefined;
const cachedPolicies = new Map<string, JurisdictionApprovalPolicy>();

function verifyPackPin(filePath: string, pin: string | undefined): void {
  if (!pin) return;
  const digest = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  if (digest !== pin) {
    throw new Error(`Wire governance pack pin mismatch: ${filePath}`);
  }
}

function loadWireGovernanceRegistry() {
  if (cachedRegistry) return cachedRegistry;
  cachedRegistry = jurisdictionWireGovernanceRegistrySchema.parse(
    YAML.parse(readFileSync(getWireGovernanceRegistryPath(), "utf-8"))
  );
  return cachedRegistry;
}

function loadPolicyForCode(code: string): JurisdictionApprovalPolicy {
  const cached = cachedPolicies.get(code);
  if (cached) return cached;

  const registry = loadWireGovernanceRegistry();
  const entry = registry.packs[code] ?? registry.packs.default;
  if (!entry) {
    throw new Error(`No wire governance pack for jurisdiction ${code} and no default pack`);
  }

  const path = resolveWireGovernancePackPath(entry.path);
  verifyPackPin(path, entry.pin);
  const policy = jurisdictionApprovalPolicySchema.parse(YAML.parse(readFileSync(path, "utf-8")));
  cachedPolicies.set(code, policy);
  return policy;
}

export function resolveJurisdictionApprovalPolicy(): JurisdictionApprovalPolicy {
  const tenant = loadTenantConfig();
  const code = tenant.jurisdiction ?? "JP";
  return loadPolicyForCode(code);
}

export function clearWireGovernanceCacheForTests(): void {
  cachedRegistry = undefined;
  cachedPolicies.clear();
}
