import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import { AGENT_ID_ALIASES, AGENT_IDS } from "../../schemas/generated/agent-ids.js";
import {
  agentCatalogSchema,
  type AgentCatalog,
  type AgentCatalogEntry,
} from "../../schemas/agent-catalog.js";
import { STEWARD_AGENTS_DIR } from "./steward-paths.js";
import { listCatalogModuleIds } from "./modules.js";
import { readYamlFile } from "./utils.js";

export const AGENT_CATALOG_PATH = join(STEWARD_AGENTS_DIR, "registry.yaml");

let cache: AgentCatalog | null = null;

export function loadAgentCatalog(): AgentCatalog {
  cache ??= readYamlFile(AGENT_CATALOG_PATH, agentCatalogSchema);
  return cache;
}

export { isAgentActive } from "./agent-activation.js";
export type { AgentActivationProfile } from "./agent-activation.js";

export function resetAgentCatalogCache(): void {
  cache = null;
}

export function listCatalogAgents(): AgentCatalogEntry[] {
  return Object.values(loadAgentCatalog().agents);
}

export function resolveAgentId(id: string): AgentId | undefined {
  const catalog = loadAgentCatalog();
  // Legacy module-facing IDs (property_rental, hospitality) must resolve to
  // their operational owner even if a future catalog entry reuses the key.
  const alias = catalog.aliases[id];
  if (alias) return alias;
  if (catalog.agents[id]) return id as AgentId;
  return undefined;
}

export function getCatalogAgent(id: string): AgentCatalogEntry | undefined {
  const resolved = resolveAgentId(id);
  return resolved ? loadAgentCatalog().agents[resolved] : undefined;
}

export function validateAgentCatalog(): string[] {
  const catalog = loadAgentCatalog();
  const issues: string[] = [];
  const ids = new Set(Object.keys(catalog.agents));
  const expectedAcceptedIds = [
    ...Object.values(catalog.agents).map((agent) => agent.id),
    ...Object.keys(catalog.aliases),
  ];

  if (JSON.stringify(AGENT_IDS) !== JSON.stringify(expectedAcceptedIds)) {
    issues.push("generated agent IDs are stale; run npm run agent:catalog:sync");
  }
  if (JSON.stringify(AGENT_ID_ALIASES) !== JSON.stringify(catalog.aliases)) {
    issues.push("generated agent aliases are stale; run npm run agent:catalog:sync");
  }

  for (const [key, agent] of Object.entries(catalog.agents)) {
    if (key !== agent.id) issues.push(`${key}: key must equal id ${agent.id}`);
    if (agent.reports_to && !ids.has(agent.reports_to)) {
      issues.push(`${agent.id}: unknown reports_to ${agent.reports_to}`);
    }
    for (const moduleId of agent.binds_modules ?? []) {
      if (!listCatalogModuleIds().includes(moduleId)) {
        issues.push(`${agent.id}: binds_modules unknown module ${moduleId}`);
      }
    }
    if (agent.class === "advisor") {
      if (agent.access.write.length)
        issues.push(`${agent.id}: advisor must not declare write access`);
      if (agent.dispatch_modes.includes("implement"))
        issues.push(`${agent.id}: advisor cannot implement`);
      if (agent.auto_route) issues.push(`${agent.id}: advisor cannot auto-route`);
      if (agent.auto_pulse) issues.push(`${agent.id}: advisor cannot auto-pulse`);
    }
    for (const delegate of [
      agent.implementation_delegate,
      agent.architecture_delegate,
      agent.production_gate_delegate,
    ]) {
      if (delegate && !ids.has(delegate)) issues.push(`${agent.id}: unknown delegate ${delegate}`);
    }
  }

  for (const [alias, target] of Object.entries(catalog.aliases)) {
    if (ids.has(alias)) issues.push(`alias collides with agent id: ${alias}`);
    if (!ids.has(target)) issues.push(`alias ${alias}: unknown target ${target}`);
  }

  for (const id of ids) {
    const seen = new Set<string>();
    let cursor: string | undefined = id;
    while (cursor) {
      if (seen.has(cursor)) {
        issues.push(`${id}: reports_to cycle at ${cursor}`);
        break;
      }
      seen.add(cursor);
      cursor = catalog.agents[cursor]?.reports_to;
    }
  }
  return [...new Set(issues)];
}
