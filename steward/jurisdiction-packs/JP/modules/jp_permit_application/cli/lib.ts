import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getModuleRootDir } from "../../../../../../src/lib/modules.js";

export const MODULE_ID = "jp_permit_application";
export const REGISTRY_MODULE_ID = "jp_permit_registry";

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]!] = cols[i] ?? "";
    }
    rows.push(row);
  }
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function catalogDir(): string {
  return join(getModuleRootDir(REGISTRY_MODULE_ID), "catalog");
}

export function loadCatalogCsv(filename: string): Record<string, string>[] {
  const path = join(catalogDir(), filename);
  if (!existsSync(path)) {
    throw new Error(`Missing catalog CSV: ${path}`);
  }
  return parseCsv(readFileSync(path, "utf-8")).rows;
}

export function listPermitTypeIdsFromCsv(): Set<string> {
  return new Set(
    loadCatalogCsv("permit-types.csv")
      .map((r) => r.permit_type_id?.trim())
      .filter((id): id is string => Boolean(id))
  );
}

export interface PermitConditionRow {
  condition_id: string;
  permit_type_id: string;
  phase: string;
  title_ja: string;
  legal_basis: string;
  severity: string;
  evidence_hint: string;
  source_id: string;
  notes: string;
}

export function loadPermitConditionsForType(
  permitTypeId: string,
  phase?: string
): PermitConditionRow[] {
  const rows = loadCatalogCsv("permit-conditions.csv");
  return rows
    .filter((r) => r.permit_type_id?.trim() === permitTypeId)
    .filter((r) => !phase || r.phase?.trim() === phase)
    .map((r) => ({
      condition_id: r.condition_id ?? "",
      permit_type_id: r.permit_type_id ?? "",
      phase: r.phase ?? "",
      title_ja: r.title_ja ?? "",
      legal_basis: r.legal_basis ?? "",
      severity: r.severity ?? "",
      evidence_hint: r.evidence_hint ?? "",
      source_id: r.source_id ?? "",
      notes: r.notes ?? "",
    }));
}

/** Validate JP permit registry catalog/*.csv (types · prerequisites · conditions). */
export function runPermitCatalogValidate(): void {
  const errors: string[] = [];
  const typesPath = join(catalogDir(), "permit-types.csv");
  if (!existsSync(typesPath)) {
    console.error("✗ permit catalog: permit-types.csv missing");
    process.exit(1);
  }

  let types: Record<string, string>[] = [];
  let prerequisites: Record<string, string>[] = [];
  let conditions: Record<string, string>[] = [];

  try {
    types = loadCatalogCsv("permit-types.csv");
    prerequisites = existsSync(join(catalogDir(), "permit-prerequisites.csv"))
      ? loadCatalogCsv("permit-prerequisites.csv")
      : [];
    conditions = existsSync(join(catalogDir(), "permit-conditions.csv"))
      ? loadCatalogCsv("permit-conditions.csv")
      : [];
  } catch (e) {
    console.error(`✗ permit catalog: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const typeIds = new Set(
    types.map((r) => r.permit_type_id).filter((id): id is string => Boolean(id?.trim()))
  );
  if (!typeIds.size) {
    errors.push("permit-types.csv has no permit_type_id rows");
  }

  for (const row of prerequisites) {
    const tid = row.permit_type_id?.trim();
    const pre = row.prerequisite_type_id?.trim();
    if (tid && !typeIds.has(tid)) {
      errors.push(`prerequisite: unknown permit_type_id ${tid}`);
    }
    if (pre && !typeIds.has(pre)) {
      errors.push(`prerequisite: unknown prerequisite_type_id ${pre}`);
    }
  }

  for (const row of conditions) {
    const tid = (row.permit_type_id ?? row.permit_type_ids)?.trim();
    if (!tid) continue;
    for (const id of tid.split(/[|;,\s]+/).filter(Boolean)) {
      if (!typeIds.has(id)) {
        errors.push(`condition ${row.condition_id ?? "?"}: unknown permit_type_id ${id}`);
      }
    }
  }

  if (errors.length) {
    console.error("✗ permit catalog validate:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `✓ permit catalog — ${typeIds.size} types · ${prerequisites.length} prerequisites · ${conditions.length} conditions`
  );
}
