import type { AgentId } from "../../schemas/classification.js";
import {
  bootstrapAllTenantAgentRosters,
  initializeTenantAgentRoster,
  listTenantsMissingAgentRoster,
  loadTenantAgentRoster,
  setTenantAgentEnabled,
  syncRosterWithModules,
  validateTenantAgentRoster,
  writeMigratedTenantAgentRoster,
  writeTenantAgentRoster,
  type AgentRosterProfile,
} from "../lib/agent-roster.js";
import { validateLegacyRosterFiles } from "../lib/tenant-roster-load.js";
import { isAgentActive, listCatalogAgents } from "../lib/agent-catalog.js";
import {
  auditCliMutation,
  requireCliOperator,
} from "../lib/console-auth/cli-operator.js";
import { setTenantId } from "../lib/tenant.js";

interface RosterOptions {
  tenant?: string;
  json?: boolean;
}

function selectTenant(tenant?: string): void {
  if (tenant) setTenantId(tenant);
}

export function runAgentRosterShow(opts: RosterOptions = {}): void {
  selectTenant(opts.tenant);
  const loaded = loadTenantAgentRoster();
  const result = {
    configured: loaded.exists,
    roster: loaded.roster,
    active: listCatalogAgents()
      .filter((agent) => isAgentActive(agent.id as AgentId, { profile: "operational" }))
      .map((agent) => agent.id),
  };
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Roster: ${loaded.exists ? loaded.source : "compatibility default (file absent)"}`);
  console.log(`Operational: ${loaded.roster.profiles.operational.join(", ") || "—"}`);
  console.log(`Developer: ${loaded.roster.profiles.developer.join(", ") || "—"}`);
  console.log(`Disabled: ${loaded.roster.disabled.join(", ") || "—"}`);
}

export function runAgentRosterInit(
  opts: RosterOptions & { force?: boolean } = {}
): void {
  selectTenant(opts.tenant);
  requireCliOperator({ permission: "agent:order", command: "agent roster init" });
  const roster = initializeTenantAgentRoster(opts.force);
  auditCliMutation("agent roster init", opts.force ? "force" : "create");
  if (opts.json) console.log(JSON.stringify(roster, null, 2));
  else console.log("✓ data/operator/agents.yaml");
}

export function runAgentRosterSet(
  enabled: boolean,
  opts: RosterOptions & { agent: string; profile?: string }
): void {
  selectTenant(opts.tenant);
  requireCliOperator({
    permission: "agent:order",
    command: `agent roster ${enabled ? "enable" : "disable"}`,
  });
  const profile = (opts.profile ?? "operational") as AgentRosterProfile;
  if (profile !== "operational" && profile !== "developer") {
    throw new Error(`Unknown roster profile: ${profile}`);
  }
  const roster = setTenantAgentEnabled(opts.agent, enabled, profile);
  auditCliMutation(
    `agent roster ${enabled ? "enable" : "disable"}`,
    `${opts.agent}:${profile}`
  );
  if (opts.json) console.log(JSON.stringify(roster, null, 2));
  else console.log(`✓ ${opts.agent} ${enabled ? "enabled" : "disabled"} (${profile})`);
}

export function runAgentRosterValidate(
  opts: RosterOptions & { syncModules?: boolean } = {}
): void {
  selectTenant(opts.tenant);
  const loaded = loadTenantAgentRoster();
  let roster = loaded.roster;
  if (opts.syncModules) {
    requireCliOperator({
      permission: "agent:order",
      command: "agent roster validate --sync-modules",
    });
    roster = syncRosterWithModules(roster);
    writeTenantAgentRoster(roster);
    auditCliMutation("agent roster validate", "sync-modules");
  }
  const issues = [...validateTenantAgentRoster(roster), ...validateLegacyRosterFiles()];
  if (opts.json) {
    console.log(JSON.stringify({ configured: loaded.exists, source: loaded.source, issues }, null, 2));
  } else if (issues.length) {
    for (const issue of issues) {
      if (issue.startsWith("deprecated:")) console.warn(`⚠ ${issue}`);
      else console.error(`✗ ${issue}`);
    }
  } else {
    console.log(`✓ agent roster valid (${loaded.source})`);
  }
  if (issues.some((issue) => !issue.startsWith("deprecated:"))) process.exitCode = 1;
}

export function runAgentRosterInitAll(
  opts: RosterOptions & { force?: boolean; dryRun?: boolean } = {}
): void {
  if (!opts.dryRun) {
    requireCliOperator({ permission: "agent:order", command: "agent roster init-all" });
  }
  const missing = listTenantsMissingAgentRoster();
  if (opts.dryRun) {
    console.log(`Tenants missing agents.yaml: ${missing.length ? missing.join(", ") : "none"}`);
    return;
  }
  const results = bootstrapAllTenantAgentRosters({ force: opts.force });
  const created = results.filter((r) => r.action === "created");
  const errors = results.filter((r) => r.action === "error");
  if (opts.json) {
    console.log(JSON.stringify({ created: created.length, errors: errors.length, results }, null, 2));
  } else {
    for (const result of results) {
      if (result.action === "created") console.log(`✓ ${result.tenantId}: ${result.detail}`);
      else if (result.action === "error") console.error(`✗ ${result.tenantId}: ${result.detail}`);
    }
    console.log(`Created ${created.length} · errors ${errors.length}`);
  }
  if (errors.length) process.exitCode = 1;
  else auditCliMutation("agent roster init-all", `created:${created.length}`);
}

export function runAgentRosterMigrate(opts: RosterOptions = {}): void {
  selectTenant(opts.tenant);
  requireCliOperator({ permission: "agent:order", command: "agent roster migrate" });
  const roster = writeMigratedTenantAgentRoster();
  auditCliMutation("agent roster migrate", "agents-enabled.yaml");
  if (opts.json) console.log(JSON.stringify(roster, null, 2));
  else console.log("✓ migrated data/operator/agents.yaml from agents-enabled.yaml");
}
