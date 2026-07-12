/**
 * Agent activation contract — catalog vs tenant roster vs pulse scope.
 */

import { listCatalogAgents, validateAgentCatalog } from "./agent-catalog.js";
import {
  listActiveTenantAgents,
  loadTenantAgentRoster,
  validateTenantAgentRoster,
} from "./agent-roster.js";
import { DEFAULT_CORE_OPERATIONAL_AGENTS } from "./tenant-roster-bootstrap.js";

export function validateAgentActivationContract(): string[] {
  const issues: string[] = [];
  issues.push(...validateAgentCatalog());

  const tenantAgents = listCatalogAgents().filter((agent) => agent.activation === "tenant").length;
  if (tenantAgents < 40) {
    issues.push(`expected most agents to use activation: tenant (got ${tenantAgents})`);
  }

  const alwaysAgents = listCatalogAgents().filter((agent) => agent.activation === "always");
  if (alwaysAgents.length > 0) {
    issues.push(
      `activation: always should be rare; review: ${alwaysAgents.map((agent) => agent.id).join(", ")}`
    );
  }

  const catalogActive = listCatalogAgents().filter((agent) => agent.status === "active").length;
  const rosterOperational = listActiveTenantAgents("operational").length;

  if (rosterOperational > catalogActive) {
    issues.push("operational roster exceeds active catalog agents");
  }

  const loaded = loadTenantAgentRoster();
  if (loaded.exists) {
    const yamlCount = loaded.roster.profiles.operational.length;
    if (rosterOperational !== yamlCount) {
      issues.push(
        `effective operational (${rosterOperational}) must match agents.yaml operational (${yamlCount})`
      );
    }
    if (rosterOperational >= catalogActive - 1) {
      issues.push(
        "configured roster should activate fewer agents than catalog — enable selective load"
      );
    }
  }

  for (const id of DEFAULT_CORE_OPERATIONAL_AGENTS) {
    if (!listActiveTenantAgents("operational").includes(id)) {
      issues.push(`default core agent not operationally active: ${id}`);
    }
  }

  const advisorPulse = listCatalogAgents().filter(
    (agent) => agent.class === "advisor" && agent.auto_pulse
  );
  if (advisorPulse.length) {
    issues.push(`advisor agents must not auto_pulse: ${advisorPulse.map((a) => a.id).join(", ")}`);
  }

  issues.push(...validateTenantAgentRoster());
  return [...new Set(issues)];
}
