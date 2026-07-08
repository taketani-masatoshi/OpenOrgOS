import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import {
  agentCapabilityManifestSchema,
  type AgentCapabilityEntry,
} from "../../schemas/agent-capability.js";
import { STEWARD_AGENTS_DIR } from "./steward-paths.js";
import { readYamlFile } from "./utils.js";

export const AGENT_CAPABILITY_MANIFEST_PATH = join(
  STEWARD_AGENTS_DIR,
  "agent-capability-manifest.yaml"
);

let _cache: Map<AgentId, AgentCapabilityEntry> | null = null;

export function loadAgentCapabilityManifest(): AgentCapabilityEntry[] {
  if (!existsSync(AGENT_CAPABILITY_MANIFEST_PATH)) return [];
  const file = readYamlFile(AGENT_CAPABILITY_MANIFEST_PATH, agentCapabilityManifestSchema);
  return file.agents;
}

export function getAgentCapability(agentId: AgentId): AgentCapabilityEntry | undefined {
  if (!_cache) {
    _cache = new Map(loadAgentCapabilityManifest().map((a) => [a.id, a]));
  }
  return _cache.get(agentId);
}

export function listAgentCapabilities(): AgentCapabilityEntry[] {
  return loadAgentCapabilityManifest();
}

export function agentSummarySlug(agentId: AgentId): string {
  return getAgentCapability(agentId)?.summary_slug ?? agentId.replace(/_/g, "-");
}

export function agentDefinitionPath(agentId: AgentId): string {
  return join(STEWARD_AGENTS_DIR, `${agentId}_agent.md`);
}

export function readAgentDefinition(agentId: AgentId): string {
  const path = agentDefinitionPath(agentId);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function resetAgentCapabilityCache(): void {
  _cache = null;
}
