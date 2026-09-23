import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  agreementsFileSchema,
  employmentRulesSourcesFileSchema,
  overtimeRecordsFileSchema,
  workRulesFileSchema,
  workplacesFileSchema,
} from "../../../../../../schemas/jp-employment-rules.js";
import { getModuleDataDir, loadModuleDataFile } from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";

export const MODULE_ID = "jp_employment_rules";

function loadDataFile<S extends z.ZodTypeAny>(filename: string, schema: S): z.output<S> | null {
  return loadModuleDataFile(MODULE_ID, filename, schema)?.data ?? null;
}

export function loadWorkplaces() {
  return loadDataFile("workplaces.yaml", workplacesFileSchema);
}

export function loadWorkRules() {
  return loadDataFile("work-rules.yaml", workRulesFileSchema);
}

export function loadAgreements() {
  return loadDataFile("agreements.yaml", agreementsFileSchema);
}

export function loadOvertimeRecords() {
  return loadDataFile("overtime-records.yaml", overtimeRecordsFileSchema);
}

export function loadSources() {
  return loadDataFile("sources.yaml", employmentRulesSourcesFileSchema);
}

export function resolveTemplatePath(templateRel: string): string | null {
  const bare = templateRel.replace(/\.example$/, "");
  const candidates = [
    join(getModuleDataDir(MODULE_ID), bare),
    join(getModuleDataDir(MODULE_ID), `${bare}.example`),
    join(getModuleSeedDir(MODULE_ID), `${bare}.example`),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function loadTemplate(templateRel: string): string {
  const path = resolveTemplatePath(templateRel);
  if (!path) throw new Error(`Template not found: ${templateRel}`);
  return readFileSync(path, "utf-8");
}

export function sourceUrl(id: string, fallback: string): string {
  return loadSources()?.sources.find((s) => s.id === id)?.url ?? fallback;
}
