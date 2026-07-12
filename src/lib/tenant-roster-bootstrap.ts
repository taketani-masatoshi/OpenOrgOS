import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { TenantAgentRoster } from "../../schemas/agent-roster.js";
import { MODULE_TO_CLASSIFICATION_AGENT, loadEnabledModulesSafe } from "./modules.js";
import { ROOT_DIR, listTenantIds } from "./tenant.js";
import { AGENT_ROSTER_REL_PATH, LEGACY_AGENTS_ENABLED_REL_PATH } from "./tenant-roster-load.js";

export const DEFAULT_CORE_OPERATIONAL_AGENTS: AgentId[] = [
  "executive_steward",
  "secretary",
  "finance",
  "contract",
  "compliance",
  "operations",
  // Platform routing delegates (platform_guide advisor → these agents)
  "engineering",
  "cto",
  "security",
];

export const TENANT_ROSTER_EXEMPT = new Set(["_template"]);

/** Ephemeral tenants created by integration tests — not roster-managed. */
const EPHEMERAL_TENANT_PATTERN = /^(test-|acme-init-test$|phase4-restore-test$)/;

export function isEphemeralTenantId(tenantId: string): boolean {
  return EPHEMERAL_TENANT_PATTERN.test(tenantId);
}

export function listRosterManagedTenants(): string[] {
  return listTenantIds()
    .filter((id) => !TENANT_ROSTER_EXEMPT.has(id) && !isEphemeralTenantId(id))
    .sort();
}

export function buildDefaultTenantRoster(): TenantAgentRoster {
  const operational = new Set<AgentId>(DEFAULT_CORE_OPERATIONAL_AGENTS);
  for (const module of loadEnabledModulesSafe()) {
    const mapped = MODULE_TO_CLASSIFICATION_AGENT[module.agent];
    if (mapped) operational.add(mapped);
  }
  return {
    version: 1,
    profiles: {
      operational: [...operational].sort(),
      developer: [],
      task: [],
    },
    disabled: [],
  };
}

export function listTenantsMissingAgentRoster(): string[] {
  const missing: string[] = [];
  for (const tenantId of listRosterManagedTenants()) {
    const rosterPath = join(ROOT_DIR, "tenants", tenantId, AGENT_ROSTER_REL_PATH);
    if (!existsSync(rosterPath)) missing.push(tenantId);
  }
  return missing.sort();
}

export function listTenantsWithLegacyAgentRoster(): string[] {
  const legacy: string[] = [];
  for (const tenantId of listRosterManagedTenants()) {
    const legacyPath = join(ROOT_DIR, "tenants", tenantId, LEGACY_AGENTS_ENABLED_REL_PATH);
    if (existsSync(legacyPath)) legacy.push(tenantId);
  }
  return legacy.sort();
}

export interface BootstrapTenantRosterResult {
  tenantId: string;
  action: "created" | "skipped" | "error";
  detail: string;
}
