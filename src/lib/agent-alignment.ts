import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadAgentCapabilityManifest } from "./agent-capability.js";
import { loadAgentCatalog, resolveAgentId } from "./agent-catalog.js";
import { validateTenantAgentRoster } from "./agent-roster.js";
import { loadChainPolicy } from "./agent-reporting.js";
import { loadRoutingRegistry } from "./routing.js";
import { loadSkillRegistry } from "./skill-registry.js";
import { ROOT_DIR } from "./tenant.js";

export interface AgentAlignmentIssue {
  source: "catalog" | "definition" | "capability" | "skill" | "route" | "chain" | "roster";
  message: string;
}

/** Cross-source contract. registry.yaml owns identity, organization, activation and access. */
export function validateAgentAlignment(): AgentAlignmentIssue[] {
  const issues: AgentAlignmentIssue[] = [];
  const catalog = loadAgentCatalog();
  const ids = new Set(Object.keys(catalog.agents));
  const capabilities = loadAgentCapabilityManifest();
  const capabilityIds = new Set(capabilities.map((entry) => entry.id));
  const routes = loadRoutingRegistry().routes;
  const routeById = new Map(routes.map((route) => [route.id, route]));

  for (const agent of Object.values(catalog.agents)) {
    const definitionPath = join(ROOT_DIR, agent.path);
    if (!existsSync(definitionPath)) {
      issues.push({ source: "definition", message: `${agent.id}: missing ${agent.path}` });
      continue;
    }
    if (agent.status !== "planned" && !capabilityIds.has(agent.id)) {
      issues.push({ source: "capability", message: `${agent.id}: missing capability entry` });
    }
    if (agent.class === "advisor") {
      const definition = readFileSync(definitionPath, "utf-8");
      if (agent.access.write.length) {
        issues.push({
          source: "catalog",
          message: `${agent.id}: advisor write access must be empty`,
        });
      }
      if (!/read-only|Read-only|書込禁止/.test(definition)) {
        issues.push({
          source: "definition",
          message: `${agent.id}: advisor definition must state read-only`,
        });
      }
      for (const path of agent.access.read) {
        if (!definition.includes(path)) {
          issues.push({
            source: "definition",
            message: `${agent.id}: catalog read path not documented: ${path}`,
          });
        }
      }
    }
  }

  for (const capability of capabilities) {
    if (!ids.has(capability.id)) {
      issues.push({ source: "capability", message: `${capability.id}: not present in catalog` });
    }
    for (const routeId of capability.route_ids) {
      const route = routeById.get(routeId);
      if (!route) {
        issues.push({
          source: "capability",
          message: `${capability.id}: unknown route ${routeId}`,
        });
      } else if (route.agent !== capability.id) {
        issues.push({
          source: "capability",
          message: `${capability.id}: route ${routeId} belongs to ${route.agent}`,
        });
      }
    }
  }

  for (const skill of loadSkillRegistry()) {
    if (!resolveAgentId(skill.agent_id)) {
      issues.push({ source: "skill", message: `${skill.id}: unknown owner ${skill.agent_id}` });
    }
  }

  for (const route of routes) {
    const resolved = resolveAgentId(route.agent);
    const agent = resolved ? catalog.agents[resolved] : undefined;
    if (!agent) {
      issues.push({ source: "route", message: `${route.id}: unknown agent ${route.agent}` });
      continue;
    }
    if (agent.class === "advisor") {
      if (!route.profiles.includes("developer") || route.profiles.includes("operational")) {
        issues.push({
          source: "route",
          message: `${route.id}: advisor route must be developer-only`,
        });
      }
    }
  }

  const chain = loadChainPolicy();
  for (const [role, id] of [
    ["hub_agent", chain.hub_agent],
    ["executive_agent", chain.executive_agent],
  ] as const) {
    if (!ids.has(id)) issues.push({ source: "chain", message: `${role}: unknown agent ${id}` });
  }
  if (chain.hub_agent === chain.executive_agent) {
    issues.push({ source: "chain", message: "reporting hub and executive must be distinct" });
  }
  for (const id of chain.excluded_from_field) {
    if (!ids.has(id))
      issues.push({ source: "chain", message: `excluded_from_field: unknown ${id}` });
  }

  for (const message of validateTenantAgentRoster()) {
    issues.push({ source: "roster", message });
  }
  return issues;
}
