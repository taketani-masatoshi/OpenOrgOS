import { existsSync } from "node:fs";
import type { AgentId } from "../../schemas/classification.js";
import { tenantAgentRosterSchema, type TenantAgentRoster } from "../../schemas/agent-roster.js";
import { getCatalogAgent, listCatalogAgents, resolveAgentId } from "./agent-catalog.js";
import { isAgentActive } from "./agent-activation.js";
import { loadEnabledModulesSafe } from "./modules.js";
import {
  AGENT_ROSTER_REL_PATH,
  LEGACY_AGENTS_ENABLED_REL_PATH,
  migrateLegacyAgentsEnabledYaml,
  readTenantAgentRosterState,
} from "./tenant-roster-load.js";
import {
  buildDefaultTenantRoster,
  listRosterManagedTenants,
  listTenantsMissingAgentRoster,
  type BootstrapTenantRosterResult,
} from "./tenant-roster-bootstrap.js";
import { setTenantId } from "./tenant.js";
import { resolveTenantPath, writeYamlFile } from "./utils.js";

export type AgentRosterProfile = keyof TenantAgentRoster["profiles"];

export { AGENT_ROSTER_REL_PATH, LEGACY_AGENTS_ENABLED_REL_PATH };

function emptyRoster(): TenantAgentRoster {
  return tenantAgentRosterSchema.parse({
    version: 1,
    profiles: { operational: [], developer: [], task: [] },
    disabled: [],
  });
}

export function migrateLegacyAgentsEnabled(
  legacyPath = resolveTenantPath(LEGACY_AGENTS_ENABLED_REL_PATH)
): TenantAgentRoster {
  return migrateLegacyAgentsEnabledYaml(legacyPath);
}

export function loadTenantAgentRoster(): {
  exists: boolean;
  roster: TenantAgentRoster;
  source: "agents.yaml" | "default";
} {
  return readTenantAgentRosterState();
}

export function agentRosterPath(): string {
  return resolveTenantPath(AGENT_ROSTER_REL_PATH);
}

export function writeTenantAgentRoster(roster: TenantAgentRoster): string {
  const parsed = tenantAgentRosterSchema.parse(roster);
  writeYamlFile(agentRosterPath(), parsed);
  return agentRosterPath();
}

export function writeMigratedTenantAgentRoster(): TenantAgentRoster {
  const legacyPath = resolveTenantPath(LEGACY_AGENTS_ENABLED_REL_PATH);
  if (!existsSync(legacyPath)) {
    throw new Error(`Legacy roster not found: ${LEGACY_AGENTS_ENABLED_REL_PATH}`);
  }
  const roster = syncRosterWithModules(migrateLegacyAgentsEnabled(legacyPath));
  const issues = validateTenantAgentRoster(roster);
  if (issues.length) throw new Error(issues.join("; "));
  writeTenantAgentRoster(roster);
  return roster;
}

export function initializeTenantAgentRoster(force = false): TenantAgentRoster {
  const current = loadTenantAgentRoster();
  if (current.exists && !force) return current.roster;
  const roster = syncRosterWithModules(buildDefaultTenantRoster());
  writeTenantAgentRoster(roster);
  return roster;
}

export function bootstrapTenantAgentRosterForCurrentTenant(force = false): TenantAgentRoster {
  const current = loadTenantAgentRoster();
  if (current.source === "agents.yaml" && !force) return current.roster;
  const roster = syncRosterWithModules(buildDefaultTenantRoster());
  const issues = validateTenantAgentRoster(roster);
  if (issues.length) throw new Error(issues.join("; "));
  writeTenantAgentRoster(roster);
  return roster;
}

export function validateTenantAgentRoster(roster = loadTenantAgentRoster().roster): string[] {
  const issues: string[] = [];
  const disabled = new Set(roster.disabled);
  const enabledModules = new Set(loadEnabledModulesSafe().map((module) => module.id));

  for (const id of roster.disabled) {
    const agent = getCatalogAgent(id);
    if (!agent) issues.push(`disabled: unknown agent ${id}`);
    else if (agent.required) issues.push(`${id}: required agent cannot be disabled`);
  }

  for (const profile of ["operational", "developer", "task"] as const) {
    const seen = new Set<string>();
    for (const id of roster.profiles[profile]) {
      const agent = getCatalogAgent(id);
      if (!agent) issues.push(`${profile}: unknown agent ${id}`);
      if (seen.has(id)) issues.push(`${profile}: duplicate agent ${id}`);
      seen.add(id);
      if (disabled.has(id)) issues.push(`${id}: both enabled and disabled`);
      if (profile === "developer" && agent?.activation !== "developer_explicit") {
        issues.push(`${id}: developer profile is only for developer_explicit agents`);
      }
      if (
        profile === "task" &&
        agent?.activation === "tenant" &&
        !roster.profiles.operational.includes(id)
      ) {
        issues.push(`${id}: task profile requires operational activation`);
      }
    }
  }

  for (const agent of listCatalogAgents()) {
    if (
      agent.binds_modules.some((moduleId) => enabledModules.has(moduleId)) &&
      disabled.has(agent.id)
    ) {
      issues.push(`${agent.id}: disabled while bound module is enabled`);
    }
  }
  return [...new Set(issues)];
}

export function syncRosterWithModules(roster: TenantAgentRoster): TenantAgentRoster {
  const enabledModules = new Set(
    loadEnabledModulesSafe().flatMap((module) => [module.id, module.agent])
  );
  const operational = new Set(roster.profiles.operational);
  const disabled = new Set(roster.disabled);
  for (const agent of listCatalogAgents()) {
    if (!agent.binds_modules.some((moduleId) => enabledModules.has(moduleId))) continue;
    disabled.delete(agent.id);
    if (agent.activation === "tenant") operational.add(agent.id);
  }
  return tenantAgentRosterSchema.parse({
    ...roster,
    profiles: {
      ...roster.profiles,
      operational: [...operational].sort(),
    },
    disabled: [...disabled].sort(),
  });
}

export function setTenantAgentEnabled(
  rawId: string,
  enabled: boolean,
  profile: AgentRosterProfile = "operational"
): TenantAgentRoster {
  const resolved = resolveAgentId(rawId);
  const agent = resolved ? getCatalogAgent(resolved) : undefined;
  if (!resolved || !agent) throw new Error(`Unknown agent: ${rawId}`);
  if (!enabled && agent.required) {
    throw new Error(`${resolved} is required and cannot be disabled`);
  }
  if (profile === "developer" && agent.activation !== "developer_explicit") {
    throw new Error(`${resolved} is not developer_explicit`);
  }
  if (profile === "task" && enabled && !isRosterAgentActive(resolved, { profile: "operational" })) {
    throw new Error(`${resolved} must be operationally active before task profile`);
  }

  const current = loadTenantAgentRoster();
  const roster = current.exists ? current.roster : emptyRoster();
  const operational = new Set(roster.profiles.operational);
  const developer = new Set(roster.profiles.developer);
  const task = new Set(roster.profiles.task);
  const disabled = new Set(roster.disabled);
  const target = profile === "developer" ? developer : profile === "task" ? task : operational;

  if (enabled) {
    target.add(resolved);
    disabled.delete(resolved);
  } else {
    target.delete(resolved);
    if (profile !== "task") disabled.add(resolved);
  }

  const updated = syncRosterWithModules(
    tenantAgentRosterSchema.parse({
      ...roster,
      profiles: {
        operational: [...operational].sort(),
        developer: [...developer].sort(),
        task: [...task].sort(),
      },
      disabled: [...disabled].sort(),
    })
  );
  const issues = validateTenantAgentRoster(updated);
  if (issues.length) throw new Error(issues.join("; "));
  writeTenantAgentRoster(updated);
  return updated;
}

export function isRosterAgentActive(
  id: AgentId,
  options: { profile?: AgentRosterProfile } = {}
): boolean {
  return isAgentActive(id, { profile: options.profile ?? "operational" });
}

export function writeTaskProfileAgents(rawIds: string[]): TenantAgentRoster {
  const current = loadTenantAgentRoster();
  const roster = current.exists ? current.roster : emptyRoster();
  const task = new Set<AgentId>();
  for (const raw of rawIds) {
    const resolved = resolveAgentId(raw);
    if (!resolved) throw new Error(`Unknown agent: ${raw}`);
    if (!isRosterAgentActive(resolved, { profile: "operational" })) {
      throw new Error(`${resolved} is not operationally active`);
    }
    task.add(resolved);
  }
  const updated = tenantAgentRosterSchema.parse({
    ...roster,
    profiles: {
      ...roster.profiles,
      task: [...task].sort(),
    },
  });
  const issues = validateTenantAgentRoster(updated);
  if (issues.length) throw new Error(issues.join("; "));
  writeTenantAgentRoster(updated);
  return updated;
}

export function clearTaskProfile(): TenantAgentRoster {
  const current = loadTenantAgentRoster();
  const roster = current.exists ? current.roster : emptyRoster();
  const updated = tenantAgentRosterSchema.parse({
    ...roster,
    profiles: { ...roster.profiles, task: [] },
  });
  writeTenantAgentRoster(updated);
  return updated;
}

export function listActiveTenantAgents(profile: AgentRosterProfile = "operational"): AgentId[] {
  return listCatalogAgents()
    .map((agent) => agent.id as AgentId)
    .filter((id) => isRosterAgentActive(id, { profile }))
    .sort();
}

export function buildAgentRosterTodaySummary(): {
  configured: boolean;
  operational_count: number;
  developer_count: number;
  task_count: number;
  operational: Array<{ id: string; label: string; tier: string }>;
  developer: Array<{ id: string; label: string; tier: string }>;
  task: Array<{ id: string; label: string; tier: string }>;
} {
  const loaded = loadTenantAgentRoster();
  const mapAgent = (id: AgentId) => {
    const agent = getCatalogAgent(id);
    return {
      id,
      label: agent?.name_ja ?? agent?.name ?? id,
      tier: agent?.tier ?? "extension",
    };
  };
  const operational = listCatalogAgents()
    .filter((agent) => isRosterAgentActive(agent.id as AgentId, { profile: "operational" }))
    .map((agent) => mapAgent(agent.id as AgentId));
  const developer = listCatalogAgents()
    .filter((agent) => isRosterAgentActive(agent.id as AgentId, { profile: "developer" }))
    .map((agent) => mapAgent(agent.id as AgentId));
  const task = listCatalogAgents()
    .filter((agent) => isRosterAgentActive(agent.id as AgentId, { profile: "task" }))
    .map((agent) => mapAgent(agent.id as AgentId));
  return {
    configured: loaded.exists,
    operational_count: operational.length,
    developer_count: developer.length,
    task_count: task.length,
    operational,
    developer,
    task,
  };
}

export function bootstrapAllTenantAgentRosters(
  opts: { force?: boolean } = {}
): BootstrapTenantRosterResult[] {
  const results: BootstrapTenantRosterResult[] = [];
  for (const tenantId of listRosterManagedTenants()) {
    setTenantId(tenantId);
    try {
      if (existsSync(agentRosterPath()) && !opts.force) {
        results.push({ tenantId, action: "skipped", detail: "agents.yaml exists" });
        continue;
      }
      const roster = syncRosterWithModules(buildDefaultTenantRoster());
      const issues = validateTenantAgentRoster(roster);
      if (issues.length) throw new Error(issues.join("; "));
      writeTenantAgentRoster(roster);
      results.push({
        tenantId,
        action: "created",
        detail: `${roster.profiles.operational.length} operational agents`,
      });
    } catch (error) {
      results.push({
        tenantId,
        action: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export { listTenantsMissingAgentRoster };
