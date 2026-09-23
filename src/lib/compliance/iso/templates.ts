import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IsoCatalogEntry } from "../../../../schemas/iso-catalog.js";
import { resolveTenantPath } from "../../tenant.js";
import { loadRecordSpecs } from "../records/spec.js";
import { STEWARD_ISO_DIR, tenantEvidenceRel } from "../packs/paths.js";
import { findIsoCatalogEntry } from "./catalog.js";

export { tenantEvidenceRel } from "../packs/paths.js";

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
  evidence_forms: IsoCatalogEntry["evidence_forms"];
  rows: IsoTemplatePlanRow[];
}

export function packTemplatesDir(standard: string): string {
  return join(STEWARD_ISO_DIR, standard, PACK_TEMPLATES_DIR);
}

export function planIsoTemplateSync(standard: string): IsoTemplatePlan {
  const entry = findIsoCatalogEntry(standard);
  if (!entry) throw new Error(`ISO catalog に ${standard} がありません。`);
  if (entry.status !== "available") {
    throw new Error(
      `${standard} は status=${entry.status} です。先に orgos iso scaffold ${standard} を実行してください。`
    );
  }

  const targetDir = tenantEvidenceRel(standard);
  const sources = new Map<string, string>();
  const packDir = packTemplatesDir(standard);
  if (existsSync(packDir)) {
    for (const file of readdirSync(packDir).filter((name) => !name.startsWith("."))) {
      sources.set(file, join(packDir, file));
    }
  }
  if (existsSync(CORE_TEMPLATES_DIR)) {
    for (const spec of loadRecordSpecs(standard)?.records ?? []) {
      if (spec.tenant_path || sources.has(spec.file)) continue;
      const coreTemplate = join(CORE_TEMPLATES_DIR, spec.file);
      if (existsSync(coreTemplate)) sources.set(spec.file, coreTemplate);
    }
  }

  const rows = [...sources.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([file, source]): IsoTemplatePlanRow => {
      const target_rel = `${targetDir}/${file}`;
      const target = resolveTenantPath(target_rel);
      return {
        file,
        source,
        target,
        target_rel,
        action: existsSync(target) ? "keep" : "create",
      };
    });
  return {
    standard,
    target_dir: targetDir,
    evidence_forms: entry.evidence_forms,
    rows,
  };
}

export function applyIsoTemplateSync(plan: IsoTemplatePlan): IsoTemplatePlanRow[] {
  const created = plan.rows.filter((row) => row.action === "create");
  for (const row of created) {
    mkdirSync(dirname(row.target), { recursive: true });
    writeFileSync(row.target, readFileSync(row.source, "utf-8"), "utf-8");
  }
  return created;
}
