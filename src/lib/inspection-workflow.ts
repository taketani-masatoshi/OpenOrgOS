/**
 * Inspection Fulfilment ワークフロー — 予定・実施・結果 · ゲート入力。
 * ADR 0012 · SSOT: data/inspections/inspection-registry.yaml
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import YAML from "yaml";
import {
  inspectionRegistryFileSchema,
  inspectionTypesCatalogSchema,
  type InspectionInstance,
} from "../../schemas/jp-inspection.js";
import { createCompanyEvent } from "./company-events.js";
import { getModuleDataDir } from "./module-business-data.js";
import { getModuleSeedDir } from "./modules.js";
import { currentDate, getDocsDir, resolveTenantPath, writeYamlFile } from "./utils.js";

const MODULE_ID = "jp_inspection";

function loadYaml<T>(path: string, parse: (raw: unknown) => T): T | null {
  if (!existsSync(path)) return null;
  return parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function loadInspectionTypes() {
  const seed = join(getModuleSeedDir(MODULE_ID), "inspection-types.yaml.example");
  const tenant = join(getModuleDataDir(MODULE_ID), "inspection-types.yaml");
  return (
    loadYaml(tenant, (r) => inspectionTypesCatalogSchema.parse(r)) ??
    loadYaml(seed, (r) => inspectionTypesCatalogSchema.parse(r))
  );
}

export function loadInspectionRegistry() {
  const path = join(getModuleDataDir(MODULE_ID), "inspection-registry.yaml");
  const data =
    loadYaml(path, (r) => inspectionRegistryFileSchema.parse(r)) ?? {
      as_of: currentDate(),
      inspections: [] as InspectionInstance[],
    };
  return { path, data };
}

function saveRegistry(inspections: InspectionInstance[]): string {
  const path = join(getModuleDataDir(MODULE_ID), "inspection-registry.yaml");
  mkdirSync(join(path, ".."), { recursive: true });
  writeYamlFile(path, { as_of: currentDate(), inspections });
  return path;
}

function nextId(typeId: string, existing: InspectionInstance[]): string {
  const ids = new Set(existing.map((i) => i.id));
  const slug = typeId.replace(/^insp-/, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  let n = 1;
  let id = `INSP-${slug}-${String(n).padStart(3, "0")}`;
  while (ids.has(id)) {
    n += 1;
    id = `INSP-${slug}-${String(n).padStart(3, "0")}`;
  }
  return id;
}

function knownType(typeId: string): boolean {
  return Boolean(loadInspectionTypes()?.types.some((t) => t.id === typeId));
}

function emitInsp(lifecycle: string, insp: InspectionInstance): string | undefined {
  try {
    return createCompanyEvent({
      kind: "compliance",
      title: `${lifecycle}: ${insp.inspection_type_id} (${insp.id})`,
      slug: `insp-${lifecycle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 40),
      related: {
        permit_id: insp.id,
        permit_type_id: insp.inspection_type_id,
        license_lifecycle: lifecycle,
        property_id: insp.property_id,
      },
      notes: `Inspection fulfilment · ${lifecycle}`,
    }).id;
  } catch (e) {
    console.error(`⚠ insp event: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

export function scheduleInspection(opts: {
  type: string;
  scheduledOn: string;
  propertyId?: string;
  relatedPermitId?: string;
  notes?: string;
  write?: boolean;
}): { inspection: InspectionInstance; path?: string; event_id?: string } {
  if (!knownType(opts.type)) throw new Error(`Unknown inspection type: ${opts.type}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.scheduledOn)) {
    throw new Error("--scheduled-on must be YYYY-MM-DD");
  }
  const { data } = loadInspectionRegistry();
  const inspection: InspectionInstance = {
    id: nextId(opts.type, data.inspections),
    inspection_type_id: opts.type,
    status: "scheduled",
    scheduled_on: opts.scheduledOn,
    property_id: opts.propertyId as InspectionInstance["property_id"],
    related_permit_id: opts.relatedPermitId,
    notes: opts.notes,
  };
  if (!opts.write) return { inspection };
  const path = saveRegistry([...data.inspections, inspection]);
  const event_id = emitInsp("InspectionScheduled", inspection);
  return { inspection, path, event_id };
}

export function completeInspection(opts: {
  id: string;
  result: "passed" | "failed" | "corrected";
  completedOn?: string;
  evidence?: string;
  write?: boolean;
}): { inspection: InspectionInstance; path?: string; event_id?: string } {
  const { data } = loadInspectionRegistry();
  const idx = data.inspections.findIndex((i) => i.id === opts.id);
  if (idx < 0) throw new Error(`Inspection not found: ${opts.id}`);
  let inspection = { ...data.inspections[idx]! };
  inspection = {
    ...inspection,
    status: opts.result,
    completed_on: opts.completedOn ?? currentDate(),
  };
  if (!opts.write) return { inspection };
  if (opts.evidence) {
    const src = opts.evidence.startsWith("/")
      ? opts.evidence
      : resolveTenantPath(opts.evidence);
    if (!existsSync(src)) throw new Error(`Evidence not found: ${opts.evidence}`);
    const destDir = join(getDocsDir(), "company", "licenses", "records", "inspection");
    mkdirSync(destDir, { recursive: true });
    const name = `${inspection.id.toLowerCase()}-${currentDate()}${extname(src) || ".pdf"}`;
    copyFileSync(src, join(destDir, name));
    inspection = {
      ...inspection,
      evidence_path: `docs/company/licenses/records/inspection/${name}`,
    };
  }
  data.inspections[idx] = inspection;
  const path = saveRegistry(data.inspections);
  const event_id = emitInsp(
    opts.result === "passed" ? "InspectionPassed" : "InspectionCompleted",
    inspection
  );
  return { inspection, path, event_id };
}

/** ゲート用: passed / corrected を充足とみなす（直近インスタンス） */
export function listSatisfiedInspectionTypeIds(): Set<string> {
  const { data } = loadInspectionRegistry();
  const byType = new Map<string, InspectionInstance>();
  for (const i of data.inspections) {
    const prev = byType.get(i.inspection_type_id);
    if (!prev || (i.completed_on ?? i.scheduled_on ?? "") > (prev.completed_on ?? prev.scheduled_on ?? "")) {
      byType.set(i.inspection_type_id, i);
    }
  }
  const ok = new Set<string>();
  for (const [typeId, i] of byType) {
    if (i.status === "passed" || i.status === "corrected") ok.add(typeId);
  }
  return ok;
}
