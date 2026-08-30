/**
 * Tenant config change requests — modules.yaml / standards.yaml / agents.yaml
 * gated by org approval (subject_type: tenant.config).
 */
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentId } from "../../../schemas/classification.js";
import type { SettlementWebAuthnAssertion } from "../../../schemas/org/settlement-stepup.js";
import {
  TENANT_CONFIG_SUBJECT,
  tenantConfigChangeFileSchema,
  tenantConfigChangeSchema,
  type TenantConfigChange,
  type TenantConfigChangeAction,
  type TenantConfigChangeFile,
  type TenantConfigTarget,
} from "../../../schemas/org/tenant-config-change.js";
import { tenantStandardsFileSchema } from "../../../schemas/tenant-standards.js";
import { modulesFileSchema } from "../../../schemas/modules.js";
import { getCatalogAgent, resolveAgentId } from "../agent-catalog.js";
import { proposeOrgApproval } from "./approval/propose.js";
import {
  humanApproveOrgApproval,
  findOrgApproval,
} from "./approval/approve.js";
import { rejectOrgApproval } from "./approval/reject.js";
import { getTenantConfigChangesPath } from "./paths.js";
import { getOrgDataDir } from "./paths.js";
import { loadTenantStandards, STANDARDS_FILE } from "../tenant-standards.js";
import { findIsoCatalogEntry } from "../iso-catalog.js";
import { listIsoStandardIds } from "../standards.js";
import {
  loadModulesFile,
  modulesFilePath,
  listCatalogModuleIds,
  MODULES_FILE,
} from "../modules.js";
import { activateTenantModule } from "../agent-workspace.js";
import { initTenantControlsFile } from "../control-framework.js";
import { syncActiveContext } from "../context-manifest.js";
import {
  isRosterAgentActive,
  loadTenantAgentRoster,
  setTenantAgentEnabled,
  syncRosterWithModules,
  writeTenantAgentRoster,
} from "../agent-roster.js";
import {
  assertCatalogModuleImportable,
  importCatalogModule,
  isModuleInstalled,
} from "../module-import.js";
import { getTenantDir } from "../tenant.js";
import { readYamlFile, writeYamlFile } from "../utils.js";
import { withYamlFileLock } from "../yaml-atomic.js";

export { TENANT_CONFIG_SUBJECT };
export type { TenantConfigTarget, TenantConfigChangeAction };

function emptyFile(): TenantConfigChangeFile {
  return tenantConfigChangeFileSchema.parse({ changes: [] });
}

export function loadTenantConfigChanges(): TenantConfigChangeFile {
  const path = getTenantConfigChangesPath();
  if (!existsSync(path)) return emptyFile();
  try {
    return readYamlFile(path, tenantConfigChangeFileSchema);
  } catch {
    return emptyFile();
  }
}

function saveTenantConfigChanges(file: TenantConfigChangeFile): void {
  const path = getTenantConfigChangesPath();
  mkdirSync(dirname(path), { recursive: true });
  writeYamlFile(path, tenantConfigChangeFileSchema.parse(file));
}

function withConfigChangeLock<T>(fn: () => T): T {
  mkdirSync(getOrgDataDir(), { recursive: true });
  return withYamlFileLock(getTenantConfigChangesPath(), fn);
}

function nextChangeId(date = new Date()): string {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const prefix = `CFG-${ymd}-`;
  let max = 0;
  for (const c of loadTenantConfigChanges().changes) {
    if (c.change_id.startsWith(prefix)) {
      const num = Number(c.change_id.slice(prefix.length));
      if (!Number.isNaN(num) && num > max) max = num;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function changeAction(change: TenantConfigChange): TenantConfigChangeAction {
  return change.action ?? "set_enabled";
}

export function readCurrentEnabled(
  target: TenantConfigTarget,
  targetId: string
): boolean {
  if (target === "agents") {
    const resolved = resolveAgentId(targetId);
    if (!resolved) return false;
    return isRosterAgentActive(resolved as AgentId, { profile: "operational" });
  }
  if (target === "standards") {
    const entry = loadTenantStandards().iso.find((e) => e.id === targetId);
    return entry?.enabled === true;
  }
  const mod = loadModulesFile().modules.find(
    (m) => m.id === targetId || m.agent === targetId
  );
  return mod?.enabled === true;
}

function assertTargetExists(
  target: TenantConfigTarget,
  targetId: string,
  action: TenantConfigChangeAction
): void {
  if (target === "agents") {
    const resolved = resolveAgentId(targetId);
    if (!resolved || !getCatalogAgent(resolved)) {
      throw new Error(`Unknown agent: ${targetId}`);
    }
    return;
  }
  if (target === "standards") {
    if (findIsoCatalogEntry(targetId)?.status === "coming_soon") {
      throw new Error(
        `${targetId} は未提供です（coming_soon）。orgos iso roadmap を参照し、orgos iso scaffold ${targetId} で昇格してください。`
      );
    }
    if (!listIsoStandardIds().includes(targetId)) {
      throw new Error(`Unknown ISO standard: ${targetId}`);
    }
    return;
  }
  if (action === "import_enable") {
    assertCatalogModuleImportable(targetId);
    return;
  }
  const catalog = listCatalogModuleIds();
  const inCatalog = catalog.includes(targetId);
  const inTenant = loadModulesFile().modules.some(
    (m) => m.id === targetId || m.agent === targetId
  );
  if (!inCatalog && !inTenant) {
    throw new Error(`Unknown module: ${targetId}`);
  }
}

/** True when approval should require settlement PassKey (capability increase). */
export function isTenantConfigPrivilegeIncrease(change: TenantConfigChange): boolean {
  const action = changeAction(change);
  if (action === "import_enable") return true;
  if (!change.to_enabled) return false;
  return (
    change.target === "agents" ||
    change.target === "modules" ||
    change.target === "standards"
  );
}

export function planSideEffects(
  target: TenantConfigTarget,
  targetId: string,
  toEnabled: boolean,
  action: TenantConfigChangeAction = "set_enabled"
): string[] {
  if (target === "agents") {
    return [
      `Enable agent ${targetId} in agents.yaml (operational profile)`,
      "sync-context (best-effort)",
    ];
  }
  if (target === "standards") {
    const effects = [`Update ${STANDARDS_FILE} (${targetId} → ${toEnabled})`, "sync-context"];
    if (toEnabled) effects.splice(1, 0, "controls init (if needed)");
    return effects;
  }
  if (action === "import_enable") {
    const importLine = isModuleInstalled(targetId)
      ? `Module ${targetId} already imported — enable only`
      : `Import module ${targetId} into ${MODULES_FILE}`;
    return [
      importLine,
      `Activate module ${targetId} (modules.yaml + seeds/scaffold as applicable)`,
      "sync-context",
      "agent roster sync (best-effort)",
    ];
  }
  if (toEnabled) {
    return [
      `Activate module ${targetId} (modules.yaml + seeds/scaffold as applicable)`,
      "sync-context",
      "agent roster sync (best-effort)",
    ];
  }
  return [
    `Set ${MODULES_FILE} ${targetId} enabled: false`,
    "sync-context",
    "agent roster sync (best-effort)",
  ];
}

function proposeLabel(
  target: TenantConfigTarget,
  targetId: string,
  enabled: boolean,
  action: TenantConfigChangeAction
): string {
  if (target === "agents") {
    return `エージェント ${targetId} を追加`;
  }
  if (target === "standards") {
    return `${targetId} を${enabled ? "有効化" : "無効化"}`;
  }
  if (action === "import_enable") {
    return `モジュール ${targetId} を追加して有効化`;
  }
  return `モジュール ${targetId} を${enabled ? "有効化" : "無効化"}`;
}

export interface ProposeTenantConfigChangeInput {
  target: TenantConfigTarget;
  targetId: string;
  enabled: boolean;
  proposedBy: string;
  message?: string;
  action?: TenantConfigChangeAction;
}

export interface ProposeTenantConfigChangeResult {
  change: TenantConfigChange;
  approval_id: string;
}

export function proposeTenantConfigChange(
  input: ProposeTenantConfigChangeInput
): ProposeTenantConfigChangeResult {
  const action = input.action ?? "set_enabled";
  assertTargetExists(input.target, input.targetId, action);

  let fromEnabled: boolean;
  let toEnabled: boolean;

  if (action === "import_enable") {
    if (input.target !== "modules") {
      throw new Error("import_enable is only valid for modules");
    }
    if (!input.enabled) {
      throw new Error("import_enable requires enabled=true");
    }
    fromEnabled = readCurrentEnabled("modules", input.targetId);
    if (fromEnabled) {
      throw new Error(`Module ${input.targetId} is already enabled`);
    }
    toEnabled = true;
  } else {
    fromEnabled = readCurrentEnabled(input.target, input.targetId);
    toEnabled = input.enabled;
    if (fromEnabled === toEnabled) {
      throw new Error(
        `${input.target} ${input.targetId} is already enabled=${toEnabled}`
      );
    }
  }

  return withConfigChangeLock(() => {
    const file = loadTenantConfigChanges();
    const dup = file.changes.find(
      (c) =>
        c.status === "pending_approval" &&
        c.target === input.target &&
        c.target_id === input.targetId &&
        changeAction(c) === action &&
        c.to_enabled === toEnabled
    );
    if (dup) {
      throw new Error(
        `Pending change already exists: ${dup.change_id} (${dup.approval_id})`
      );
    }

    const changeId = nextChangeId();
    const sideEffects = planSideEffects(input.target, input.targetId, toEnabled, action);
    const label = proposeLabel(input.target, input.targetId, toEnabled, action);
    const message = input.message?.trim() || label;

    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: TENANT_CONFIG_SUBJECT,
      subjectRef: changeId,
      proposedBy: input.proposedBy,
      message,
    });

    const change = tenantConfigChangeSchema.parse({
      change_id: changeId,
      target: input.target,
      target_id: input.targetId,
      action,
      from_enabled: fromEnabled,
      to_enabled: toEnabled,
      status: "pending_approval",
      approval_id: approval.approval_id,
      proposed_by: input.proposedBy,
      message,
      proposed_at: approval.proposed_at,
      side_effects_plan: sideEffects,
    });

    file.changes.push(change);
    file.as_of = new Date().toISOString().slice(0, 10);
    saveTenantConfigChanges(file);
    return { change, approval_id: approval.approval_id };
  });
}

export function findTenantConfigChange(
  changeId: string
): TenantConfigChange | undefined {
  return loadTenantConfigChanges().changes.find((c) => c.change_id === changeId);
}

export function findTenantConfigChangeByApproval(
  approvalId: string
): TenantConfigChange | undefined {
  return loadTenantConfigChanges().changes.find((c) => c.approval_id === approvalId);
}

export interface TenantConfigPreview {
  approval_id: string;
  change_id: string;
  target: TenantConfigTarget;
  target_id: string;
  from_enabled: boolean;
  to_enabled: boolean;
  message: string;
  side_effects_plan: string[];
  diff_line: string;
  preview: string;
}

function formatDiffLine(change: TenantConfigChange): string {
  const action = changeAction(change);
  if (change.target === "agents") {
    return `agent ${change.target_id}: ${change.from_enabled} → ${change.to_enabled}`;
  }
  if (action === "import_enable") {
    return `module ${change.target_id}: import + enable`;
  }
  return `${change.target_id}: ${change.from_enabled} → ${change.to_enabled}`;
}

export function previewTenantConfigChange(approvalId: string): TenantConfigPreview {
  const approval = findOrgApproval(approvalId);
  if (!approval || approval.subject_type !== TENANT_CONFIG_SUBJECT) {
    throw new Error(`tenant.config approval ${approvalId} not found`);
  }
  const change =
    findTenantConfigChangeByApproval(approvalId) ??
    (approval.subject_ref ? findTenantConfigChange(approval.subject_ref) : undefined);
  if (!change) {
    throw new Error(`Config change for approval ${approvalId} not found`);
  }
  const diffLine = formatDiffLine(change);
  const action = changeAction(change);
  const preview = [
    `# テナント設定変更 — ${change.change_id}`,
    "",
    `- 対象: ${change.target}`,
    `- ID: ${change.target_id}`,
    ...(action !== "set_enabled" ? [`- アクション: ${action}`] : []),
    `- 変更: **${change.from_enabled} → ${change.to_enabled}**`,
    `- 摘要: ${change.message}`,
    "",
    "## 副作用（承認後）",
    ...change.side_effects_plan.map((s) => `- ${s}`),
    "",
    "承認には reviewed=true（差分確認済み）が必要です。",
    isTenantConfigPrivilegeIncrease(change)
      ? "高権限のため iPhone Settlement PassKey が必要です。"
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    approval_id: approvalId,
    change_id: change.change_id,
    target: change.target,
    target_id: change.target_id,
    from_enabled: change.from_enabled,
    to_enabled: change.to_enabled,
    message: change.message,
    side_effects_plan: change.side_effects_plan,
    diff_line: diffLine,
    preview,
  };
}

function setStandardEnabled(isoId: string, enabled: boolean): void {
  const file = loadTenantStandards();
  let entry = file.iso.find((e) => e.id === isoId);
  if (!entry) {
    entry = { id: isoId, enabled, applicability: "applicable" };
    file.iso.push(entry);
  } else {
    entry.enabled = enabled;
  }
  writeYamlFile(
    join(getTenantDir(), STANDARDS_FILE),
    tenantStandardsFileSchema.parse(file)
  );
}

function setModuleEnabledFlag(moduleId: string, enabled: boolean): void {
  const file = loadModulesFile();
  const mod = file.modules.find((m) => m.id === moduleId || m.agent === moduleId);
  if (!mod) {
    throw new Error(`Module ${moduleId} not in ${MODULES_FILE}`);
  }
  mod.enabled = enabled;
  writeYamlFile(modulesFilePath(), modulesFileSchema.parse(file));
}

function trySyncRoster(): string | undefined {
  try {
    const current = loadTenantAgentRoster();
    if (!current.exists) return "roster file missing — skipped sync";
    const updated = syncRosterWithModules(current.roster);
    writeTenantAgentRoster(updated);
    return undefined;
  } catch (err) {
    return `roster sync warning: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export interface ApplyTenantConfigChangeResult {
  change: TenantConfigChange;
  warnings: string[];
}

/**
 * Apply YAML + side effects for an already-approved (or about-to-mark) change.
 * Prefer approveAndApplyTenantConfigChange from Chat / CLI approve path.
 */
export function applyTenantConfigChange(changeId: string): ApplyTenantConfigChangeResult {
  return withConfigChangeLock(() => {
    const file = loadTenantConfigChanges();
    const idx = file.changes.findIndex((c) => c.change_id === changeId);
    if (idx < 0) throw new Error(`Config change ${changeId} not found`);
    const change = file.changes[idx]!;
    if (change.status === "applied") {
      return { change, warnings: change.apply_warnings ?? [] };
    }
    if (change.status !== "pending_approval") {
      throw new Error(
        `Config change ${changeId} cannot be applied (status=${change.status})`
      );
    }

    const warnings: string[] = [];
    const action = changeAction(change);

    if (change.target === "agents") {
      if (!change.to_enabled) {
        throw new Error(`Agent disable via tenant.config is not supported (${changeId})`);
      }
      setTenantAgentEnabled(change.target_id, true);
    } else if (change.target === "standards") {
      setStandardEnabled(change.target_id, change.to_enabled);
      if (change.to_enabled) {
        try {
          initTenantControlsFile();
        } catch (err) {
          warnings.push(
            `controls init: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } else if (action === "import_enable") {
      if (!isModuleInstalled(change.target_id)) {
        try {
          importCatalogModule(change.target_id);
        } catch (err) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
      try {
        activateTenantModule(change.target_id);
      } catch (err) {
        try {
          setModuleEnabledFlag(change.target_id, true);
          warnings.push(
            `activate fallback to flag-only: ${err instanceof Error ? err.message : String(err)}`
          );
        } catch (err2) {
          throw err2 instanceof Error ? err2 : err;
        }
      }
    } else if (change.to_enabled) {
      try {
        activateTenantModule(change.target_id);
      } catch (err) {
        try {
          setModuleEnabledFlag(change.target_id, true);
          warnings.push(
            `activate fallback to flag-only: ${err instanceof Error ? err.message : String(err)}`
          );
        } catch (err2) {
          throw err2 instanceof Error ? err2 : err;
        }
      }
    } else {
      setModuleEnabledFlag(change.target_id, false);
    }

    try {
      syncActiveContext();
    } catch (err) {
      warnings.push(`sync-context: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (change.target === "modules" || change.target === "agents") {
      const rosterWarn = trySyncRoster();
      if (rosterWarn) warnings.push(rosterWarn);
    }

    const applied = tenantConfigChangeSchema.parse({
      ...change,
      status: "applied",
      applied_at: new Date().toISOString(),
      apply_warnings: warnings.length ? warnings : undefined,
    });
    file.changes[idx] = applied;
    saveTenantConfigChanges(file);
    return { change: applied, warnings };
  });
}

export interface ApproveAndApplyTenantConfigOptions {
  approvalId: string;
  approverId: string;
  operatorId?: string;
  reviewed?: boolean;
  settlementAssertion?: SettlementWebAuthnAssertion & {
    challenge_id: string;
    token: string;
  };
}

export function approveAndApplyTenantConfigChange(
  opts: ApproveAndApplyTenantConfigOptions
): {
  approval: ReturnType<typeof humanApproveOrgApproval>["approval"];
  change: TenantConfigChange;
  warnings: string[];
} {
  if (opts.reviewed !== true) {
    throw new Error(
      `tenant.config approval ${opts.approvalId} requires preview review and reviewed=true`
    );
  }
  const preview = previewTenantConfigChange(opts.approvalId);
  const approved = humanApproveOrgApproval({
    approvalId: opts.approvalId,
    approverId: opts.approverId,
    operatorId: opts.operatorId,
    source: "chat_ui",
    humanReviewConfirmed: true,
    settlementAssertion: opts.settlementAssertion,
  });
  const applied = applyTenantConfigChange(preview.change_id);
  return {
    approval: approved.approval,
    change: applied.change,
    warnings: applied.warnings,
  };
}

export function rejectTenantConfigChange(opts: {
  approvalId: string;
  approverId: string;
  reason?: string;
}): { approval: ReturnType<typeof rejectOrgApproval>["approval"]; change?: TenantConfigChange } {
  const change = findTenantConfigChangeByApproval(opts.approvalId);
  const rejected = rejectOrgApproval({
    approvalId: opts.approvalId,
    approverId: opts.approverId,
    reason: opts.reason,
  });
  if (!change) return { approval: rejected.approval };

  return withConfigChangeLock(() => {
    const file = loadTenantConfigChanges();
    const idx = file.changes.findIndex((c) => c.change_id === change.change_id);
    if (idx >= 0) {
      file.changes[idx] = tenantConfigChangeSchema.parse({
        ...file.changes[idx],
        status: "rejected",
        rejected_at: new Date().toISOString(),
      });
      saveTenantConfigChanges(file);
      return { approval: rejected.approval, change: file.changes[idx] };
    }
    return { approval: rejected.approval, change };
  });
}

export function listPendingTenantConfigChanges(): TenantConfigChange[] {
  return loadTenantConfigChanges().changes.filter((c) => c.status === "pending_approval");
}

export function isTenantConfigApprovalSubject(subjectType: string): boolean {
  return subjectType === TENANT_CONFIG_SUBJECT;
}
