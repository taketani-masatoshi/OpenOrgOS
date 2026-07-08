import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import {
  controlMapFileSchema,
  tenantControlsFileSchema,
  type ControlDefinition,
  type ControlGapRow,
  type ControlMaturity,
  type EffectiveControl,
  type TenantControlStatus,
} from "../../schemas/control-framework.js";
import { listEffectiveRegulations } from "./regulations.js";
import { getIsoStandardDir, STEWARD_STANDARDS_DIR } from "./standards.js";
import { JURISDICTION_PACKS_DIR } from "./steward-paths.js";
import { loadEnabledIsoIds } from "./tenant-standards.js";
import { getTenantDir, resolveTenantPath } from "./tenant.js";
import { readYamlFile, writeYamlFile } from "./utils.js";

export const CONTROL_FRAMEWORK_DIR = join(STEWARD_STANDARDS_DIR, "control-framework");
export const TENANT_CONTROLS_REL = "data/compliance/controls.yaml";

const MATURITY_ORDER: ControlMaturity[] = ["L0", "L1", "L2", "L3", "L4"];

export function controlsFilePath(): string {
  return join(getTenantDir(), TENANT_CONTROLS_REL);
}

export function getControlMapPath(standardId: string): string {
  return join(getIsoStandardDir(standardId), "control-map.yaml");
}

export function loadControlMapForStandard(standardId: string): ControlDefinition[] {
  const path = getControlMapPath(standardId);
  if (!existsSync(path)) return [];
  const file = readYamlFile(path, controlMapFileSchema);
  return file.controls;
}

export function loadControlMaps(enabledIsoIds?: string[]): ControlDefinition[] {
  const enabled = enabledIsoIds ?? loadEnabledIsoIds();
  const byId = new Map<string, ControlDefinition>();
  for (const isoId of enabled) {
    for (const ctrl of loadControlMapForStandard(isoId)) {
      byId.set(ctrl.id, ctrl);
    }
  }
  return [...byId.values()];
}

export function loadTenantControlStatus(): Map<string, TenantControlStatus> {
  const path = controlsFilePath();
  if (!existsSync(path)) return new Map();
  const file = readYamlFile(path, tenantControlsFileSchema);
  return new Map(file.controls.map((c) => [c.id, c]));
}

export function maturityRank(level: ControlMaturity): number {
  return MATURITY_ORDER.indexOf(level);
}

export function isMaturityBelow(current: ControlMaturity, target: ControlMaturity): boolean {
  return maturityRank(current) < maturityRank(target);
}

function controlIsoStandards(ctrl: ControlDefinition): string[] {
  return [...new Set(ctrl.iso_refs.map((r) => r.standard))];
}

function isControlIsoInScope(ctrl: ControlDefinition, enabledIso: string[]): boolean {
  return controlIsoStandards(ctrl).some((id) => enabledIso.includes(id));
}

function isControlRegInScope(
  ctrl: ControlDefinition,
  effectiveRegIds: Set<string>
): boolean {
  if (ctrl.reg_refs.length === 0) return true;
  return ctrl.reg_refs.some((r) => effectiveRegIds.has(r.reg_id));
}

function matchesGlobPattern(tenantRelPath: string, pattern: string): boolean {
  const normalized = tenantRelPath.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/").replace(/^\.\//, "");

  if (pat.includes("*")) {
    const base = pat.replace(/\/\*\*\/\*$/, "").replace(/\/\*\*$/, "").replace(/\*\*$/, "");
    if (base && !normalized.startsWith(base.replace(/\/$/, ""))) {
      return false;
    }
    return true;
  }
  return normalized === pat;
}

function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** True if at least one evidence path exists for the tenant. */
export function hasEvidenceForControl(ctrl: ControlDefinition): boolean {
  if (ctrl.evidence_paths.length === 0) return true;

  for (const pattern of ctrl.evidence_paths) {
    if (!pattern.includes("*")) {
      if (existsSync(resolveTenantPath(pattern))) return true;
      continue;
    }

    const base = pattern
      .replace(/\/\*\*\/\*$/, "")
      .replace(/\/\*\*$/, "")
      .replace(/\*\*$/, "")
      .replace(/\/$/, "");
    const absBase = resolveTenantPath(base);
    if (!existsSync(absBase)) continue;

    const stat = statSync(absBase);
    if (stat.isFile()) return true;

    const files = listFilesRecursive(absBase);
    if (files.length > 0) {
      const relFiles = files.map((f) => f.replace(getTenantDir() + "/", "").replace(/\\/g, "/"));
      if (relFiles.some((f) => matchesGlobPattern(f, pattern))) return true;
      if (pattern.endsWith("/**/*") || pattern.endsWith("/**")) return true;
    }
  }
  return false;
}

export function listEffectiveControls(): EffectiveControl[] {
  const enabledIso = loadEnabledIsoIds();
  const effectiveRegs = listEffectiveRegulations().filter((r) => r.effective);
  const effectiveRegIds = new Set(effectiveRegs.map((r) => r.id));
  const statusMap = loadTenantControlStatus();
  const controls = loadControlMaps(enabledIso);

  return controls.map((ctrl) => {
    const isoScope = isControlIsoInScope(ctrl, enabledIso);
    const regScope = isControlRegInScope(ctrl, effectiveRegIds);
    const in_scope = isoScope && regScope;
    const status = statusMap.get(ctrl.id);
    return {
      ...ctrl,
      in_scope,
      tenant_maturity: status?.maturity ?? "L0",
      last_reviewed: status?.last_reviewed,
      notes: status?.notes,
    };
  });
}

export function controlsForAgent(agentId: AgentId): EffectiveControl[] {
  return listEffectiveControls().filter(
    (c) =>
      c.in_scope &&
      (c.primary_agent === agentId || c.secondary_agents?.includes(agentId))
  );
}

export function computeControlGaps(): ControlGapRow[] {
  const gaps: ControlGapRow[] = [];
  const effectiveRegs = listEffectiveRegulations();
  const effectiveRegIds = new Set(
    effectiveRegs.filter((r) => r.effective).map((r) => r.id)
  );

  for (const ctrl of listEffectiveControls()) {
    if (!ctrl.in_scope) continue;

    if (ctrl.reg_refs.length > 0) {
      const missingRegs = ctrl.reg_refs.filter((r) => !effectiveRegIds.has(r.reg_id));
      if (missingRegs.length === ctrl.reg_refs.length) {
        gaps.push({
          control_id: ctrl.id,
          title: ctrl.title,
          gap_type: "reg_not_effective",
          detail: `必要規程未有効: ${missingRegs.map((r) => r.reg_id).join(", ")}`,
          primary_agent: ctrl.primary_agent,
        });
        continue;
      }
    }

    if (isMaturityBelow(ctrl.tenant_maturity, ctrl.target_maturity)) {
      gaps.push({
        control_id: ctrl.id,
        title: ctrl.title,
        gap_type: "maturity_below_target",
        detail: `現在 ${ctrl.tenant_maturity} · 目標 ${ctrl.target_maturity}`,
        primary_agent: ctrl.primary_agent,
      });
    }

    if (
      maturityRank(ctrl.tenant_maturity) >= maturityRank("L2") &&
      !hasEvidenceForControl(ctrl)
    ) {
      gaps.push({
        control_id: ctrl.id,
        title: ctrl.title,
        gap_type: "doc_missing",
        detail: `証拠パス未充足: ${ctrl.evidence_paths.join(", ") || "(none)"}`,
        primary_agent: ctrl.primary_agent,
      });
    }

    if (ctrl.last_reviewed) {
      const reviewed = new Date(ctrl.last_reviewed);
      const ageDays = (Date.now() - reviewed.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 365 && maturityRank(ctrl.tenant_maturity) >= maturityRank("L2")) {
        gaps.push({
          control_id: ctrl.id,
          title: ctrl.title,
          gap_type: "evidence_stale",
          detail: `最終レビュー ${ctrl.last_reviewed}（365日超）`,
          primary_agent: ctrl.primary_agent,
        });
      }
    }
  }

  return gaps;
}

export function formatControlStatusReport(): string {
  const controls = listEffectiveControls().filter((c) => c.in_scope);
  const gaps = computeControlGaps();
  const byDomain = new Map<string, EffectiveControl[]>();
  for (const c of controls) {
    const list = byDomain.get(c.domain) ?? [];
    list.push(c);
    byDomain.set(c.domain, list);
  }

  const lines = [
    "# Control Status — ISO × REG 統制",
    "",
    `**スコープ内統制:** ${controls.length} 件`,
    `**ギャップ:** ${gaps.length} 件`,
    "",
    "## 成熟度サマリ",
    "",
    "| ドメイン | L0 | L1 | L2 | L3 | L4 |",
    "|----------|----|----|----|----|-----|",
  ];

  for (const [domain, list] of [...byDomain.entries()].sort()) {
    const counts = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 };
    for (const c of list) counts[c.tenant_maturity]++;
    lines.push(
      `| ${domain} | ${counts.L0} | ${counts.L1} | ${counts.L2} | ${counts.L3} | ${counts.L4} |`
    );
  }

  lines.push("", "## ギャップ", "");
  if (gaps.length === 0) {
    lines.push("ギャップなし ✓", "");
  } else {
    lines.push("| CTL | 種別 | 統制 | 詳細 | Agent |", "|-----|------|------|------|-------|");
    for (const g of gaps) {
      lines.push(
        `| ${g.control_id} | ${g.gap_type} | ${g.title} | ${g.detail} | ${g.primary_agent} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function initTenantControlsFile(opts: { dryRun?: boolean } = {}): {
  path: string;
  count: number;
} {
  const enabledIso = loadEnabledIsoIds();
  const controls = loadControlMaps(enabledIso);
  const existing = loadTenantControlStatus();
  const entries: TenantControlStatus[] = controls.map((c) => {
    const prev = existing.get(c.id);
    return (
      prev ?? {
        id: c.id,
        maturity: "L0" as ControlMaturity,
      }
    );
  });

  const data = {
    version: "1",
    as_of: new Date().toISOString().slice(0, 10),
    controls: entries,
  };

  const path = controlsFilePath();
  if (!opts.dryRun) {
    writeYamlFile(path, data);
  }
  return { path, count: entries.length };
}

export function setTenantControlMaturity(opts: {
  id: string;
  maturity: ControlMaturity;
  notes?: string;
}): void {
  const path = controlsFilePath();
  let file = existsSync(path)
    ? readYamlFile(path, tenantControlsFileSchema)
    : { version: "1", controls: [] as TenantControlStatus[] };

  const idx = file.controls.findIndex((c) => c.id === opts.id);
  const entry: TenantControlStatus = {
    id: opts.id,
    maturity: opts.maturity,
    last_reviewed: new Date().toISOString().slice(0, 10),
    notes: opts.notes,
  };

  if (idx >= 0) {
    file.controls[idx] = { ...file.controls[idx], ...entry };
  } else {
    file.controls.push(entry);
  }
  file.as_of = new Date().toISOString().slice(0, 10);
  writeYamlFile(path, file);
}

export function getRegBindingsAbsPath(jurisdictionCode: string): string {
  return join(JURISDICTION_PACKS_DIR, jurisdictionCode, "control-framework", "reg-bindings.yaml");
}
