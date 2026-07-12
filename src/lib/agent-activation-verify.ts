/**
 * Agent activation contract — catalog vs tenant roster vs pulse scope.
 */

import { listCatalogAgents, resolveAgentId, validateAgentCatalog } from "./agent-catalog.js";
import {
  listActiveTenantAgents,
  loadTenantAgentRoster,
  validateTenantAgentRoster,
} from "./agent-roster.js";
import {
  DEFAULT_CORE_OPERATIONAL_AGENTS,
  listRosterManagedTenants,
} from "./tenant-roster-bootstrap.js";
import { getTenantId, setTenantId } from "./tenant.js";
import { resolveTenantPath } from "./utils.js";

function validateCurrentTenantActivation(): string[] {
  const issues: string[] = [];
  const tenantId = getTenantId();
  const catalogActive = listCatalogAgents().filter((agent) => agent.status === "active").length;
  const rosterOperational = listActiveTenantAgents("operational").length;
  const loaded = loadTenantAgentRoster();

  if (!loaded.exists) {
    if (rosterOperational > DEFAULT_CORE_OPERATIONAL_AGENTS.length) {
      issues.push(
        `${tenantId}: unconfigured roster must not exceed core default (${DEFAULT_CORE_OPERATIONAL_AGENTS.length})`
      );
    }
    issues.push(
      `${tenantId}: missing data/operator/agents.yaml — using core-only default; run orgos agent roster init`
    );
  } else {
    const activeSet = new Set(listActiveTenantAgents("operational"));
    for (const id of loaded.roster.profiles.operational) {
      const resolved = resolveAgentId(id) ?? id;
      if (!activeSet.has(resolved as never)) {
        issues.push(
          `${tenantId}: roster operational ${id} is not effectively active (resolved ${resolved})`
        );
      }
    }
    if (rosterOperational >= catalogActive - 1) {
      issues.push(
        `${tenantId}: configured roster should activate fewer agents than catalog — selective load required`
      );
    }
  }

  if (rosterOperational > catalogActive) {
    issues.push(`${tenantId}: operational roster exceeds active catalog agents`);
  }

  for (const id of DEFAULT_CORE_OPERATIONAL_AGENTS) {
    if (!listActiveTenantAgents("operational").includes(id)) {
      issues.push(`${tenantId}: default core agent not operationally active: ${id}`);
    }
  }

  issues.push(
    ...validateTenantAgentRoster().map((issue) =>
      issue.startsWith(`${tenantId}:`) ? issue : `${tenantId}: ${issue}`
    )
  );
  return issues;
}

export function validateAgentActivationContract(opts: { allTenants?: boolean } = {}): string[] {
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

  const advisorPulse = listCatalogAgents().filter(
    (agent) => agent.class === "advisor" && agent.auto_pulse
  );
  if (advisorPulse.length) {
    issues.push(`advisor agents must not auto_pulse: ${advisorPulse.map((a) => a.id).join(", ")}`);
  }

  const previousTenant = process.env.ORGOS_TENANT;
  const tenants =
    opts.allTenants === false ? [getTenantId()] : listRosterManagedTenants();

  for (const tenantId of tenants) {
    setTenantId(tenantId);
    try {
      issues.push(...validateCurrentTenantActivation());
    } catch (error) {
      const path = (() => {
        try {
          return resolveTenantPath("data/operator/agents.yaml");
        } catch {
          return "(unresolved)";
        }
      })();
      issues.push(
        `${tenantId}: activation check failed at ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (previousTenant) setTenantId(previousTenant);
  else if (tenants.length) setTenantId(tenants[0]!);

  return [...new Set(issues)];
}
