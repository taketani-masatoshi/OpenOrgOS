import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { STEWARD_ISO_DIR } from "./standards.js";
import { findIsoCatalogEntry } from "./iso-catalog.js";
import type { IsoCatalogEntry } from "../../schemas/iso-catalog.js";
import { resolveTenantPath } from "./tenant.js";

/** Where a pack keeps blank evidence forms. */
export const PACK_TEMPLATES_DIR = "templates";

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
  const dir = packTemplatesDir(standard);
  if (!existsSync(dir)) {
    return {
      standard,
      target_dir: tenantEvidenceRel(standard),
      evidence_forms: entry.evidence_forms,
      rows: [],
    };
  }
  const targetRelDir = tenantEvidenceRel(standard);
  const rows = readdirSync(dir)
    .filter((f) => !f.startsWith("."))
    .sort()
    .map((file): IsoTemplatePlanRow => {
      const target_rel = `${targetRelDir}/${file}`;
      const target = resolveTenantPath(target_rel);
      return {
        file,
        source: join(dir, file),
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
