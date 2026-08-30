/**
 * CEO-facing inventory: roster agents (use/don't use) and modules (import vs on/off).
 */
import type { AgentId } from "../../../schemas/classification.js";
import { getCatalogAgent, listCatalogAgents, resolveAgentId } from "../agent-catalog.js";
import {
  isOwnerDeskAgent,
  requestLaneForAgent,
  type AgentLockReason,
  type AgentRequestLane,
} from "../agent-owner-desks.js";
import { isRosterAgentActive, loadTenantAgentRoster } from "../agent-roster.js";
import { getModuleTier } from "../module-readiness.js";
import {
  listTenantScopeCatalogModuleIds,
  loadEnabledModulesSafe,
  loadModuleManifest,
  loadModulesFileSafe,
  MODULE_TO_CLASSIFICATION_AGENT,
  type ModuleAgentId,
} from "../modules.js";
import { listPendingTenantConfigChanges } from "../org/tenant-config-change.js";
import { DEFAULT_CORE_OPERATIONAL_AGENTS } from "../tenant-roster-bootstrap.js";

export type { AgentLockReason, AgentRequestLane };

export interface AgentInventoryRow {
  id: string;
  label: string;
  scope: string;
  tier: string;
  enabled: boolean;
  required: boolean;
  owner_desk: boolean;
  locked: boolean;
  lock_reason?: AgentLockReason;
  reports_to?: string;
  reports_to_label?: string;
  request_lane: AgentRequestLane;
  bound_modules: string[];
  pending?: ModulePendingChange;
}

export interface ModulePendingChange {
  change_id: string;
  approval_id: string;
  to_enabled: boolean;
}

export interface ModuleInventoryRow {
  id: string;
  label: string;
  notes?: string;
  installed: boolean;
  enabled: boolean;
  tier: string;
  pending?: ModulePendingChange;
}

export interface AgentModuleInventory {
  agents: AgentInventoryRow[];
  agents_available: AgentInventoryRow[];
  modules_installed: ModuleInventoryRow[];
  modules_catalog: ModuleInventoryRow[];
}

function uniqueResolvedIds(rawIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawIds) {
    const resolved = resolveAgentId(raw) ?? raw;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

function moduleLabel(catalogId: string): string {
  const own = getCatalogAgent(catalogId);
  if (own?.name_ja || own?.name) return own.name_ja ?? own.name;
  const mapped = MODULE_TO_CLASSIFICATION_AGENT[catalogId as ModuleAgentId];
  const owner = mapped ? getCatalogAgent(mapped) : undefined;
  if (owner?.name_ja || owner?.name) return owner.name_ja ?? owner.name;
  return catalogId;
}

function moduleNotes(catalogId: string, tenantNotes?: string): string | undefined {
  const notes = tenantNotes?.trim() || loadModuleManifest(catalogId)?.notes?.trim();
  return notes || undefined;
}

function pendingByModule(): Map<string, ModulePendingChange> {
  const map = new Map<string, ModulePendingChange>();
  for (const change of listPendingTenantConfigChanges()) {
    if (change.target !== "modules") continue;
    map.set(change.target_id, {
      change_id: change.change_id,
      approval_id: change.approval_id,
      to_enabled: change.to_enabled,
    });
  }
  return map;
}

function shouldListAgent(opts: {
  required: boolean;
  tier: string;
  inRoster: boolean;
  boundInstalled: boolean;
}): boolean {
  return opts.required || opts.tier === "core" || opts.inRoster || opts.boundInstalled;
}

function pendingByAgent(): Map<string, ModulePendingChange> {
  const map = new Map<string, ModulePendingChange>();
  for (const change of listPendingTenantConfigChanges()) {
    if (change.target !== "agents" || !change.to_enabled) continue;
    map.set(change.target_id, {
      change_id: change.change_id,
      approval_id: change.approval_id,
      to_enabled: true,
    });
  }
  return map;
}

function toAgentRow(
  agent: ReturnType<typeof listCatalogAgents>[number],
  installedIds: Set<string>,
  enabledIds: Set<string>,
  pending?: ModulePendingChange
): AgentInventoryRow {
  const boundInstalled = agent.binds_modules.filter((id) => installedIds.has(id));
  const boundEnabled = boundInstalled.filter((id) => enabledIds.has(id));
  const required = agent.required === true;
  const ownerDesk = isOwnerDeskAgent(agent.id);
  const lockedByModule = boundEnabled.length > 0;
  const reportsTo = agent.reports_to;
  const reportsToAgent = reportsTo ? getCatalogAgent(reportsTo) : undefined;
  const lock_reason: AgentLockReason | undefined = ownerDesk
    ? "owner_desk"
    : required
      ? "required"
      : lockedByModule
        ? "module_enabled"
        : undefined;
  return {
    id: agent.id,
    label: agent.name_ja ?? agent.name,
    scope: agent.scope,
    tier: agent.tier,
    enabled: isRosterAgentActive(agent.id as AgentId, { profile: "operational" }),
    required,
    owner_desk: ownerDesk,
    locked: ownerDesk || required || lockedByModule,
    lock_reason,
    reports_to: reportsTo,
    reports_to_label: reportsToAgent
      ? (reportsToAgent.name_ja ?? reportsToAgent.name)
      : reportsTo,
    request_lane: requestLaneForAgent(agent.id),
    bound_modules: boundInstalled,
    pending,
  };
}

export function buildAgentModuleInventory(): AgentModuleInventory {
  const loaded = loadTenantAgentRoster();
  const rosterIds = new Set(
    uniqueResolvedIds([
      ...DEFAULT_CORE_OPERATIONAL_AGENTS,
      ...(loaded.roster.profiles.operational ?? []),
      ...(loaded.roster.disabled ?? []),
    ])
  );
  // A minimal or half-provisioned tenant may have no modules.yaml at all; that
  // is an empty inventory, not a reason to fail the request.
  const tenantModules = loadModulesFileSafe().modules;
  const installedIds = new Set(tenantModules.map((m) => m.id));
  const enabledIds = new Set(loadEnabledModulesSafe().map((m) => m.id));
  const pendingModules = pendingByModule();
  const pendingAgents = pendingByAgent();

  const agents: AgentInventoryRow[] = [];
  const agents_available: AgentInventoryRow[] = [];
  for (const agent of listCatalogAgents()) {
    if (agent.status === "planned") continue;
    if (agent.activation === "developer_explicit") continue;
    const boundInstalled = agent.binds_modules.filter((id) => installedIds.has(id));
    const inRoster = rosterIds.has(agent.id);
    const listed = shouldListAgent({
      required: agent.required,
      tier: agent.tier,
      inRoster,
      boundInstalled: boundInstalled.length > 0,
    });
    const agentPending = pendingAgents.get(agent.id);
    if (listed) {
      agents.push(toAgentRow(agent, installedIds, enabledIds, agentPending));
      continue;
    }
    if (agent.class === "advisor") continue;
    const row = toAgentRow(agent, installedIds, enabledIds, agentPending);
    if (row.enabled) continue;
    agents_available.push(row);
  }
  const deskOrder = (id: string) =>
    id === "executive_steward" ? 0 : id === "secretary" ? 1 : 2;
  agents.sort((a, b) => {
    const desk = deskOrder(a.id) - deskOrder(b.id);
    if (desk !== 0) return desk;
    if (a.owner_desk !== b.owner_desk) return a.owner_desk ? -1 : 1;
    return a.label.localeCompare(b.label, "ja");
  });
  agents_available.sort((a, b) => a.label.localeCompare(b.label, "ja"));

  const modules_installed: ModuleInventoryRow[] = tenantModules
    .map((mod) => ({
      id: mod.id,
      label: moduleLabel(mod.id),
      notes: moduleNotes(mod.id, mod.notes),
      installed: true,
      enabled: mod.enabled === true,
      tier: getModuleTier(mod.id),
      pending: pendingModules.get(mod.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));

  const modules_catalog: ModuleInventoryRow[] = listTenantScopeCatalogModuleIds()
    .filter((id) => !installedIds.has(id))
    .map((id) => ({
      id,
      label: moduleLabel(id),
      notes: moduleNotes(id),
      installed: false,
      enabled: false,
      tier: getModuleTier(id),
      pending: pendingModules.get(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));

  return { agents, agents_available, modules_installed, modules_catalog };
}
