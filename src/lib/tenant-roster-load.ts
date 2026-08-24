import { existsSync } from "node:fs";
import type { AgentId } from "../../schemas/classification.js";
import { AGENT_ID_ALIASES, AGENT_IDS } from "../../schemas/generated/agent-ids.js";
import {
  tenantAgentRosterSchema,
  type TenantAgentRoster,
} from "../../schemas/agent-roster.js";
import { z } from "zod";
import { MODULE_TO_CLASSIFICATION_AGENT, type ModuleAgentId } from "./modules.js";
import { resolveTenantPath, readYamlFile } from "./utils.js";

/**
 * Agents active when data/operator/agents.yaml is absent, and seeded by
 * `orgos agent roster init`. Includes the finance triangle (finance →
 * accounting → tax): every corporation needs tax/accounting ops by default.
 */
export const DEFAULT_CORE_OPERATIONAL_AGENTS: AgentId[] = [
  "executive_steward",
  "secretary",
  "finance",
  "accounting",
  "tax",
  "contract",
  "compliance",
  "operations",
  "engineering",
  "cto",
  "security",
];

export const AGENT_ROSTER_REL_PATH = "data/operator/agents.yaml";
export const LEGACY_AGENTS_ENABLED_REL_PATH = "data/operator/agents-enabled.yaml";

const ACCEPTED_IDS = new Set<string>(AGENT_IDS);
const LEGACY_CORE_ALIASES: Record<string, string> = {
  executive: "executive_steward",
};

const legacyAgentsEnabledSchema = z
  .object({
    core: z.array(z.string()).optional(),
    modules: z.record(z.string(), z.array(z.string())).optional(),
  })
  .passthrough();

function resolveRosterAgentId(raw: string): AgentId | undefined {
  const mapped = LEGACY_CORE_ALIASES[raw] ?? raw;
  const moduleMapped = MODULE_TO_CLASSIFICATION_AGENT[mapped as ModuleAgentId];
  const candidate = moduleMapped ?? mapped;
  if (ACCEPTED_IDS.has(candidate)) return candidate as AgentId;
  const alias = AGENT_ID_ALIASES[candidate as keyof typeof AGENT_ID_ALIASES];
  return alias as AgentId | undefined;
}

export function migrateLegacyAgentsEnabledYaml(
  legacyPath = resolveTenantPath(LEGACY_AGENTS_ENABLED_REL_PATH)
): TenantAgentRoster {
  const legacy = readYamlFile(legacyPath, legacyAgentsEnabledSchema);
  const operational = new Set<AgentId>();

  for (const raw of legacy.core ?? []) {
    const resolved = resolveRosterAgentId(raw);
    if (resolved) operational.add(resolved);
  }
  for (const moduleAgents of Object.values(legacy.modules ?? {})) {
    for (const raw of moduleAgents) {
      const resolved = resolveRosterAgentId(raw);
      if (resolved) operational.add(resolved);
    }
  }

  return tenantAgentRosterSchema.parse({
    version: 1,
    profiles: {
      operational: [...operational].sort(),
      developer: [],
    },
    disabled: [],
  });
}

export function validateLegacyRosterFiles(): string[] {
  const issues: string[] = [];
  const rosterPath = resolveTenantPath(AGENT_ROSTER_REL_PATH);
  const legacyPath = resolveTenantPath(LEGACY_AGENTS_ENABLED_REL_PATH);
  const hasRoster = existsSync(rosterPath);
  const hasLegacy = existsSync(legacyPath);

  if (hasLegacy && hasRoster) {
    issues.push(
      "error: agents-enabled.yaml coexists with agents.yaml — remove legacy file (orgos agent roster migrate)"
    );
  } else if (hasLegacy && !hasRoster) {
    issues.push(
      "error: legacy roster agents-enabled.yaml without agents.yaml — run orgos agent roster migrate"
    );
  }
  return issues;
}

export function readTenantAgentRosterState(): {
  exists: boolean;
  roster: TenantAgentRoster;
  source: "agents.yaml" | "default";
} {
  const rosterPath = resolveTenantPath(AGENT_ROSTER_REL_PATH);
  if (!existsSync(rosterPath)) {
    return {
      exists: false,
      roster: tenantAgentRosterSchema.parse({
        version: 1,
        profiles: {
          operational: [...DEFAULT_CORE_OPERATIONAL_AGENTS].sort(),
          developer: [],
          task: [],
        },
        disabled: [],
      }),
      source: "default",
    };
  }

  try {
    return {
      exists: true,
      roster: readYamlFile(rosterPath, tenantAgentRosterSchema),
      source: "agents.yaml",
    };
  } catch {
    // Corrupt / empty / null YAML — treat as unconfigured core-only default.
    return {
      exists: false,
      roster: tenantAgentRosterSchema.parse({
        version: 1,
        profiles: {
          operational: [...DEFAULT_CORE_OPERATIONAL_AGENTS].sort(),
          developer: [],
          task: [],
        },
        disabled: [],
      }),
      source: "default",
    };
  }
}
