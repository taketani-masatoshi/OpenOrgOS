import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import {
  controlMapFileSchema,
  coreControlMapFileSchema,
  coreProfileFileSchema,
  tenantControlsFileSchema,
  type ControlDefinition,
  type ControlGapRow,
  type ControlMaturity,
  type CoreBinding,
  type CoreControlDefinition,
  type EffectiveControl,
  type IsoRef,
  type TenantControlStatus,
} from "../../schemas/control-framework.js";
import { isoCatalogFileSchema } from "../../schemas/iso-catalog.js";
import { invalidRecordPaths } from "./iso-records.js";
import { listEffectiveRegulations } from "./regulations.js";
import { getIsoStandardDir, STEWARD_ISO_DIR, STEWARD_STANDARDS_DIR } from "./standards.js";
import { JURISDICTION_PACKS_DIR } from "./steward-paths.js";
import { loadApplicableIsoIds } from "./tenant-standards.js";
import { getTenantDir, resolveTenantPath } from "./tenant.js";
import { readYamlFile, writeYamlFile } from "./utils.js";

export const CONTROL_FRAMEWORK_DIR = join(STEWARD_STANDARDS_DIR, "control-framework");
export const TENANT_CONTROLS_REL = "data/compliance/controls.yaml";

const MATURITY_ORDER: ControlMaturity[] = ["L0", "L1", "L2", "L3", "L4"];

export function controlsFilePath(): string {
  return join(getTenantDir(), TENANT_CONTROLS_REL);
}

export function getControlMapPath(standardId: string): string {
  if (standardId === "financial") {
    return join(STEWARD_STANDARDS_DIR, "audit", "financial", "control-map.yaml");
  }
  if (standardId === "jsox") {
    return join(JURISDICTION_PACKS_DIR, "JP", "modules", "jp_jsox", "control-map.yaml");
  }
  return join(getIsoStandardDir(standardId), "control-map.yaml");
}

export const CORE_MS_DIR = join(STEWARD_ISO_DIR, "core");

export function coreControlMapPath(): string {
  return join(CORE_MS_DIR, "control-map.yaml");
}

export function coreProfilesPath(): string {
  return join(CORE_MS_DIR, "profiles.yaml");
}

export function loadCoreControls(): CoreControlDefinition[] {
  const path = coreControlMapPath();
  if (!existsSync(path)) return [];
  return readYamlFile(path, coreControlMapFileSchema).controls;
}

export function loadCoreProfile(name: string): CoreBinding[] {
  const path = coreProfilesPath();
  if (!existsSync(path)) return [];
  return readYamlFile(path, coreProfileFileSchema).profiles[name] ?? [];
}

export function loadControlMapFile(standardId: string) {
  const path = getControlMapPath(standardId);
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, controlMapFileSchema);
}

export function loadControlMapForStandard(standardId: string): ControlDefinition[] {
  return loadControlMapFile(standardId)?.controls ?? [];
}

export function loadCoreBindingsForStandard(standardId: string): CoreBinding[] {
  return loadControlMapFile(standardId)?.core_bindings ?? [];
}

/** Edition year per standard, read straight from the catalog to avoid an import cycle. */
function loadIsoEditions(): Map<string, string> {
  const path = join(STEWARD_ISO_DIR, "catalog.yaml");
  if (!existsSync(path)) return new Map();
  const file = readYamlFile(path, isoCatalogFileSchema);
  return new Map(file.standards.map((s) => [s.id, s.year]));
}

/**
 * Synthesize the core controls that the enabled standards actually bind to.
 * A core control with no binding is not emitted — no orphans.
 */
function synthesizeCoreControls(enabled: string[]): ControlDefinition[] {
  const core = loadCoreControls();
  if (core.length === 0) return [];
  const editions = loadIsoEditions();

  const bindingsByWork = new Map<string, { standard: string; binding: CoreBinding }[]>();
  for (const isoId of enabled) {
    for (const binding of loadCoreBindingsForStandard(isoId)) {
      const list = bindingsByWork.get(binding.work) ?? [];
      list.push({ standard: isoId, binding });
      bindingsByWork.set(binding.work, list);
    }
  }

  const out: ControlDefinition[] = [];
  for (const ctrl of core) {
    const bound = bindingsByWork.get(ctrl.work);
    if (!bound || bound.length === 0) continue;

    const iso_refs: IsoRef[] = bound.map(({ standard, binding }) => ({
      standard,
      clause: binding.clause,
      ...(editions.get(standard) ? { edition: editions.get(standard) } : {}),
      ...(binding.verified_on ? { verified_on: binding.verified_on } : {}),
      ...(binding.verified_by ? { verified_by: binding.verified_by } : {}),
    }));

    const evidence_paths = [
      ...new Set([...ctrl.evidence_paths, ...bound.flatMap((b) => b.binding.evidence_paths)]),
    ];

    const regRefs = new Map<string, { reg_id: string; articles?: string[] }>();
    for (const ref of [...ctrl.reg_refs, ...bound.flatMap((b) => b.binding.reg_refs)]) {
      const prev = regRefs.get(ref.reg_id);
      const articles = [...new Set([...(prev?.articles ?? []), ...(ref.articles ?? [])])];
      regRefs.set(ref.reg_id, {
        reg_id: ref.reg_id,
        ...(articles.length > 0 ? { articles } : {}),
      });
    }

    const { work: _work, supersedes: _supersedes, guidance_refs: _guidance, ...rest } = ctrl;
    out.push({ ...rest, iso_refs, evidence_paths, reg_refs: [...regRefs.values()] });
  }
  return out;
}

export function loadControlMaps(enabledIsoIds?: string[]): ControlDefinition[] {
  const enabled = enabledIsoIds ?? loadApplicableIsoIds();
  const byId = new Map<string, ControlDefinition>();
  for (const ctrl of synthesizeCoreControls(enabled)) {
    byId.set(ctrl.id, ctrl);
  }
  const editions = loadIsoEditions();
  for (const isoId of enabled) {
    for (const ctrl of loadControlMapForStandard(isoId)) {
      byId.set(ctrl.id, {
        ...ctrl,
        iso_refs: ctrl.iso_refs.map((r) => ({
          ...r,
          ...(r.edition ?? editions.get(r.standard)
            ? { edition: r.edition ?? editions.get(r.standard) }
            : {}),
        })),
      });
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

/** Unfilled placeholder token used by pack templates, e.g. `{FACILITY_NAME}`. */
const TEMPLATE_PLACEHOLDER = /\{[A-Z][A-Z0-9_]*\}/;

/**
 * A blank form is not evidence.
 *
 * Distributing pack templates (`orgos iso templates`) must not flip a control to
 * conforming, so a record file only counts once it carries content: a CSV needs a
 * data row, and a Markdown form must have its placeholders replaced.
 */
function evidenceFileIsUnfilled(abs: string): boolean {
  let text: string;
  try {
    text = readFileSync(abs, "utf-8");
  } catch {
    return false;
  }
  if (abs.endsWith(".csv")) {
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    return rows.length <= 1;
  }
  if (abs.endsWith(".md")) return TEMPLATE_PLACEHOLDER.test(text);
  return false;
}

function evidencePathSatisfied(pattern: string): boolean {
  if (!pattern.includes("*")) {
    const abs = resolveTenantPath(pattern);
    if (!existsSync(abs)) return false;
    return !statSync(abs).isFile() || !evidenceFileIsUnfilled(abs);
  }

  const base = pattern
    .replace(/\/\*\*\/\*$/, "")
    .replace(/\/\*\*$/, "")
    .replace(/\*\*$/, "")
    .replace(/\/$/, "");
  const absBase = resolveTenantPath(base);
  if (!existsSync(absBase)) return false;

  const stat = statSync(absBase);
  if (stat.isFile()) return true;

  const files = listFilesRecursive(absBase);
  if (files.length === 0) return false;
  const relFiles = files.map((f) => f.replace(getTenantDir() + "/", "").replace(/\\/g, "/"));
  if (relFiles.some((f) => matchesGlobPattern(f, pattern))) return true;
  return pattern.endsWith("/**/*") || pattern.endsWith("/**");
}

/** Evidence paths declared by the control that do not exist for the tenant. */
export function missingEvidencePaths(ctrl: ControlDefinition): string[] {
  return ctrl.evidence_paths.filter((p) => !evidencePathSatisfied(p));
}

/**
 * Why each unsatisfied path failed, so an operator knows whether to create the
 * file or to fill in a form that is already sitting there.
 */
export function describeMissingEvidence(ctrl: ControlDefinition): string[] {
  return missingEvidencePaths(ctrl).map((p) => {
    if (p.includes("*")) return `${p}（記録なし）`;
    const abs = resolveTenantPath(p);
    if (!existsSync(abs)) return `${p}（未作成）`;
    return `${p}（様式が未記入）`;
  });
}

/**
 * `any` mode — one existing path is enough.
 * `all` mode — every path must exist, so folding per-standard artefacts into one
 * core control does not hide a standard that owes its own evidence.
 */
export function hasEvidenceForControl(ctrl: ControlDefinition): boolean {
  if (ctrl.evidence_paths.length === 0) return true;
  const missing = missingEvidencePaths(ctrl);
  return ctrl.evidence_mode === "all"
    ? missing.length === 0
    : missing.length < ctrl.evidence_paths.length;
}

export function listEffectiveControls(): EffectiveControl[] {
  const enabledIso = loadApplicableIsoIds();
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
  const invalidRecords = invalidRecordPaths(loadApplicableIsoIds());
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
        detail: `証拠パス未充足: ${describeMissingEvidence(ctrl).join(", ") || "(none)"}`,
        primary_agent: ctrl.primary_agent,
      });
    }

    // A record that exists but fails its spec is not evidence. Reported apart
    // from doc_missing so the operator can tell "write it" from "fix it".
    const faulty = ctrl.evidence_paths.filter((p) => invalidRecords.has(p));
    if (faulty.length > 0) {
      const detail = faulty
        .map((p) => `${p}: ${invalidRecords.get(p)?.length ?? 0} 件の不備`)
        .join(", ");
      gaps.push({
        control_id: ctrl.id,
        title: ctrl.title,
        gap_type: "record_invalid",
        detail: `記録の内容が仕様を満たしません — ${detail}`,
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
  const enabledIso = loadApplicableIsoIds();
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
