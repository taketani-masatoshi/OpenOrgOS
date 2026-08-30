import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { STEWARD_ISO_DIR } from "./standards.js";
import { findIsoCatalogEntry } from "./iso-catalog.js";
import type { IsoCatalogEntry } from "../../schemas/iso-catalog.js";
import { loadRecordSpecs } from "./iso-records.js";
import { resolveTenantPath } from "./tenant.js";

/** Where a pack keeps blank evidence forms. */
export const PACK_TEMPLATES_DIR = "templates";
export const CORE_TEMPLATES_DIR = join(STEWARD_ISO_DIR, "core", "templates");

export type IsoTemplateAction = "create" | "keep";

export interface IsoTemplatePlanRow {
  file: string;
  source: string;
  target: string;
  target_rel: string;
  action: IsoTemplateAction;
}

export interface IsoTemplatePlan {
  standard: string;
  target_dir: string;
  /** Catalog claim about whether the pack covers every evidence file. */
  evidence_forms: IsoCatalogEntry["evidence_forms"];
  rows: IsoTemplatePlanRow[];
}

export function packTemplatesDir(standard: string): string {
  return join(STEWARD_ISO_DIR, standard, PACK_TEMPLATES_DIR);
}

export function tenantEvidenceRel(standard: string): string {
  return `docs/compliance/iso/${standard}`;
}

/**
 * Plan a copy of a pack's blank forms into the tenant evidence folder.
 *
 * Existing tenant files are never overwritten: once a form holds real records,
 * the pack template is no longer the authority for that file.
 */
export function planIsoTemplateSync(standard: string): IsoTemplatePlan {
  const entry = findIsoCatalogEntry(standard);
  if (!entry) throw new Error(`ISO catalog に ${standard} がありません。`);
  if (entry.status !== "available") {
    throw new Error(
      `${standard} は status=${entry.status} です。先に orgos iso scaffold ${standard} を実行してください。`,
    );
  }
  const targetRelDir = tenantEvidenceRel(standard);
  const sources = new Map<string, string>();
  const packDir = packTemplatesDir(standard);
  if (existsSync(packDir)) {
    for (const file of readdirSync(packDir).filter((f) => !f.startsWith("."))) {
      sources.set(file, join(packDir, file));
    }
  }
  if (existsSync(CORE_TEMPLATES_DIR)) {
    const specs = loadRecordSpecs(standard)?.records ?? [];
    for (const spec of specs) {
      if (spec.tenant_path) continue;
      if (sources.has(spec.file)) continue;
      const core = join(CORE_TEMPLATES_DIR, spec.file);
      if (existsSync(core)) sources.set(spec.file, core);
    }
  }
  const rows = [...sources.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, source]): IsoTemplatePlanRow => {
      const target_rel = `${targetRelDir}/${file}`;
      const target = resolveTenantPath(target_rel);
      return {
        file,
        source,
        target,
        target_rel,
        action: existsSync(target) ? "keep" : "create",
      };
    });
  return { standard, target_dir: targetRelDir, evidence_forms: entry.evidence_forms, rows };
}

export function applyIsoTemplateSync(plan: IsoTemplatePlan): IsoTemplatePlanRow[] {
  const created = plan.rows.filter((r) => r.action === "create");
  for (const row of created) {
    mkdirSync(dirname(row.target), { recursive: true });
    writeFileSync(row.target, readFileSync(row.source, "utf-8"), "utf-8");
  }
  return created;
}
