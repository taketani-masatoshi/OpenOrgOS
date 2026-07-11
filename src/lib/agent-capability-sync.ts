/**
 * Derive agent-capability-manifest.yaml from catalog · skills · routing.
 * Preserves existing data_paths / docs_paths / pulse_checks as seed data.
 */

import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import type { AgentId } from "../../schemas/classification.js";
import {
  agentCapabilityManifestSchema,
  type AgentCapabilityEntry,
  type AgentCapabilityManifest,
} from "../../schemas/agent-capability.js";
import { AGENT_CAPABILITY_MANIFEST_PATH } from "./agent-capability.js";
import { listCatalogAgents, loadAgentCatalog } from "./agent-catalog.js";
import { loadRoutingRegistry } from "./routing.js";
import { loadSkillRegistry } from "./skill-registry.js";
import { readYamlFile } from "./utils.js";

function slugFromId(id: string): string {
  return id.replace(/_/g, "-");
}

function loadSeedManifest(): Map<AgentId, AgentCapabilityEntry> {
  try {
    const file = readYamlFile(AGENT_CAPABILITY_MANIFEST_PATH, agentCapabilityManifestSchema);
    return new Map(file.agents.map((a) => [a.id, a]));
  } catch {
    return new Map();
  }
}

export function buildCapabilityManifest(): AgentCapabilityManifest {
  const catalog = loadAgentCatalog();
  const seed = loadSeedManifest();
  const skillsByAgent = new Map<AgentId, string[]>();
  for (const skill of loadSkillRegistry()) {
    const list = skillsByAgent.get(skill.agent_id) ?? [];
    list.push(skill.id);
    skillsByAgent.set(skill.agent_id, list);
  }

  const routesByAgent = new Map<AgentId, string[]>();
  for (const route of loadRoutingRegistry().routes) {
    const list = routesByAgent.get(route.agent) ?? [];
    list.push(route.id);
    routesByAgent.set(route.agent, list);
  }

  const agents: AgentCapabilityEntry[] = [];

  for (const agent of listCatalogAgents()) {
    if (agent.status === "planned") continue;

    const existing = seed.get(agent.id);
    const capBlock = agent.capability;

    if (agent.class === "advisor") {
      agents.push({
        id: agent.id,
        summary_slug: capBlock?.summary_slug ?? existing?.summary_slug ?? slugFromId(agent.id),
        data_paths: [],
        docs_paths: capBlock?.docs_paths ?? existing?.docs_paths ?? agent.access.read.filter((p) => p.startsWith("docs/")),
        route_ids: [],
        skills: [...new Set(skillsByAgent.get(agent.id) ?? existing?.skills ?? [])].sort(),
        pulse_checks: [],
      });
      continue;
    }

    const dataPaths = capBlock?.data_paths ?? existing?.data_paths ?? [];
    const docsPaths = capBlock?.docs_paths ?? existing?.docs_paths ?? [];
    // Relations are always derived. Keeping old generated values here would
    // make renamed routes/skill ownership survive forever.
    const routeIds = [...new Set(routesByAgent.get(agent.id) ?? [])].sort();
    const skillIds = [...new Set(skillsByAgent.get(agent.id) ?? [])].sort();

    agents.push({
      id: agent.id,
      summary_slug: capBlock?.summary_slug ?? existing?.summary_slug ?? slugFromId(agent.id),
      data_paths: dataPaths,
      docs_paths: docsPaths,
      route_ids: routeIds,
      skills: skillIds,
      pulse_checks: capBlock?.pulse_checks ?? existing?.pulse_checks ?? [],
    });
  }

  agents.sort((a, b) => a.id.localeCompare(b.id));
  return agentCapabilityManifestSchema.parse({
    version: String(catalog.version),
    agents,
  });
}

export function syncAgentCapabilityManifest(write = false): AgentCapabilityManifest {
  const manifest = buildCapabilityManifest();
  if (write) {
    const header =
      "# Generated from steward/core/agents/registry.yaml + skills + routing.\n" +
      "# Regenerate: npm run agent:capability:sync\n\n";
    writeFileSync(AGENT_CAPABILITY_MANIFEST_PATH, header + YAML.stringify(manifest, { lineWidth: 120 }), "utf-8");
  }
  return manifest;
}

export function validateCapabilityManifestDrift(): string[] {
  const issues: string[] = [];
  const built = buildCapabilityManifest();
  let onDisk: AgentCapabilityManifest;
  try {
    onDisk = readYamlFile(AGENT_CAPABILITY_MANIFEST_PATH, agentCapabilityManifestSchema);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }

  const builtMap = new Map(built.agents.map((a) => [a.id, a]));
  const diskMap = new Map(onDisk.agents.map((a) => [a.id, a]));

  for (const [id, entry] of builtMap) {
    const disk = diskMap.get(id);
    if (!disk) {
      issues.push(`manifest missing agent ${id}`);
      continue;
    }
    const builtRoutes = [...entry.route_ids].sort().join(",");
    const diskRoutes = [...disk.route_ids].sort().join(",");
    if (builtRoutes !== diskRoutes) {
      issues.push(`${id}: route_ids drift (expected ${builtRoutes || "—"})`);
    }
    const builtSkills = [...entry.skills].sort().join(",");
    const diskSkills = [...disk.skills].sort().join(",");
    if (builtSkills !== diskSkills) {
      issues.push(`${id}: skills drift`);
    }
  }

  for (const id of diskMap.keys()) {
    if (!builtMap.has(id)) issues.push(`manifest stale agent ${id}`);
  }

  return issues;
}
