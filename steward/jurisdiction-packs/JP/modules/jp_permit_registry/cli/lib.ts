import {
  permitApplicationRegistryFileSchema,
  permitObligationInstancesFileSchema,
  permitObligationsCatalogFileSchema,
  permitRegistryFileSchema,
  permitFormsCatalogFileSchema,
  permitFieldMapFileSchema,
  permitTypesCatalogFileSchema,
  type PermitInstanceEntry,
  type PermitObligationEntry,
  type PermitTypeEntry,
} from "../../../../../../schemas/jp-permit-registry.js";
import type { z } from "zod";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
  daysUntil,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { currentDate } from "../../../../../../src/lib/utils.js";

export const MODULE_ID = "jp_permit_registry";

const CATALOG_FILES = {
  types: "permit-types-catalog.yaml",
  obligations: "obligations-catalog.yaml",
  sources: "sources.yaml",
  forms: "forms-catalog.yaml",
  fieldMap: "field-map.yaml",
} as const;

const TENANT_FILES = {
  registry: "permit-registry.yaml",
  applications: "application-registry.yaml",
  obligationInstances: "obligation-instances.yaml",
} as const;

function loadDataFile<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): { path: string; data: z.output<S> } | null {
  return loadModuleDataFile<z.output<S>>(
    MODULE_ID,
    filename,
    schema as z.ZodType<z.output<S>>
  );
}

function loadCatalog<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): { path: string; data: z.output<S> } | null {
  const fromTenant = loadDataFile(filename, schema);
  if (fromTenant) return fromTenant;
  const fromSeed = loadDataFile(`${filename}.example`, schema);
  if (fromSeed) return fromSeed;
  return null;
}

function loadTenantFile<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): { path: string; data: z.output<S> } | null {
  return loadDataFile(filename, schema);
}

function typeMap(types: PermitTypeEntry[]): Map<string, PermitTypeEntry> {
  return new Map(types.map((t) => [t.id, t]));
}

function obligationMap(obligations: PermitObligationEntry[]): Map<string, PermitObligationEntry> {
  return new Map(obligations.map((o) => [o.id, o]));
}

export function runJpPermitRegistryValidate(): void {
  const errors: string[] = [];
  const types = loadCatalog(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  const obligations = loadCatalog(CATALOG_FILES.obligations, permitObligationsCatalogFileSchema);
  const forms = loadCatalog(CATALOG_FILES.forms, permitFormsCatalogFileSchema);
  const fieldMap = loadCatalog(CATALOG_FILES.fieldMap, permitFieldMapFileSchema);
  const registry = loadTenantFile(TENANT_FILES.registry, permitRegistryFileSchema);
  const applications = loadTenantFile(TENANT_FILES.applications, permitApplicationRegistryFileSchema);
  const instances = loadTenantFile(TENANT_FILES.obligationInstances, permitObligationInstancesFileSchema);

  if (!types) errors.push(`${CATALOG_FILES.types} missing`);
  if (!obligations) errors.push(`${CATALOG_FILES.obligations} missing`);
  if (!forms) errors.push(`${CATALOG_FILES.forms} missing`);
  if (!fieldMap) errors.push(`${CATALOG_FILES.fieldMap} missing`);

  if (forms && types) {
    const typeIds = typeMap(types.data.permit_types);
    for (const form of forms.data.forms) {
      for (const tid of form.permit_type_ids) {
        if (!typeIds.has(tid)) {
          errors.push(`form ${form.id} references unknown permit_type_id ${tid}`);
        }
      }
    }
  }

  if (fieldMap) {
    for (const m of fieldMap.data.mappings) {
      if (!m.source.includes(".")) {
        errors.push(`field-map ${m.form_field}: invalid source ${m.source}`);
      }
    }
  }

  if (types && obligations) {
    const ids = typeMap(types.data.permit_types);
    for (const ob of obligations.data.obligations) {
      for (const tid of ob.permit_type_ids) {
        if (!ids.has(tid)) {
          errors.push(`obligation ${ob.id} references unknown permit_type_id ${tid}`);
        }
      }
    }
    for (const t of types.data.permit_types) {
      for (const pre of t.prerequisite_type_ids ?? []) {
        if (!ids.has(pre)) {
          errors.push(`permit type ${t.id} prerequisite ${pre} not in catalog`);
        }
      }
    }
  }

  if (registry && types) {
    const ids = typeMap(types.data.permit_types);
    for (const p of registry.data.permits) {
      if (!ids.has(p.permit_type_id)) {
        errors.push(`permit ${p.id} references unknown type ${p.permit_type_id}`);
      }
    }
  }

  if (applications && types) {
    const ids = typeMap(types.data.permit_types);
    for (const a of applications.data.applications) {
      if (!ids.has(a.permit_type_id)) {
        errors.push(`application ${a.id} references unknown type ${a.permit_type_id}`);
      }
    }
  }

  if (instances && obligations && registry) {
    const obIds = obligationMap(obligations.data.obligations);
    const permitIds = new Set(registry.data.permits.map((p) => p.id));
    for (const inst of instances.data.instances) {
      if (!obIds.has(inst.obligation_id)) {
        errors.push(`obligation instance ${inst.id} references unknown obligation ${inst.obligation_id}`);
      }
      if (!permitIds.has(inst.permit_id)) {
        errors.push(`obligation instance ${inst.id} references unknown permit ${inst.permit_id}`);
      }
    }
  }

  if (errors.length) {
    console.error("✗ jp_permit_registry:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const typeCount = types?.data.permit_types.length ?? 0;
  const obCount = obligations?.data.obligations.length ?? 0;
  const permitCount = registry?.data.permits.length ?? 0;
  console.log(
    `✓ jp_permit_registry — catalog ${typeCount} types · ${obCount} obligations · ${permitCount} tenant permits`
  );
}

export function runJpPermitRegistryShow(opts: { json?: boolean }): void {
  const jurisdiction = getResolvedJurisdiction();
  const types = loadCatalog(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  const obligations = loadCatalog(CATALOG_FILES.obligations, permitObligationsCatalogFileSchema);
  const registry = loadTenantFile(TENANT_FILES.registry, permitRegistryFileSchema);
  const applications = loadTenantFile(TENANT_FILES.applications, permitApplicationRegistryFileSchema);

  const summary = {
    module: MODULE_ID,
    jurisdiction: jurisdiction.code,
    catalog_version: types?.data.catalog_version ?? "—",
    sectors: types?.data.sectors.length ?? 0,
    permit_types: types?.data.permit_types.length ?? 0,
    obligations: obligations?.data.obligations.length ?? 0,
    tenant_permits: registry?.data.permits.length ?? 0,
    tenant_applications: applications?.data.applications.length ?? 0,
    data_dir: getModuleDataDir(MODULE_ID),
    seed_dir: getModuleSeedDir(MODULE_ID),
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("# jp_permit_registry\n");
  console.log(`法域: ${summary.jurisdiction} · カタログ v${summary.catalog_version}`);
  console.log(`種別: ${summary.permit_types} · 義務: ${summary.obligations} · セクター: ${summary.sectors}`);
  console.log(`テナント保有: ${summary.tenant_permits} · 申請中: ${summary.tenant_applications}`);
  console.log(`data: ${summary.data_dir}`);
  console.log("\n次: `operations permit types` · `operations permit gap`");
}

export function runJpPermitRegistryTypes(opts: { category?: string; json?: boolean }): void {
  const types = loadCatalog(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  if (!types) {
    console.error("permit-types-catalog.yaml missing");
    process.exit(1);
  }

  let list = types.data.permit_types;
  if (opts.category) {
    list = list.filter((t) => t.category === opts.category);
  }

  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }

  console.log(`# JP 許認可種別（${list.length}）\n`);
  console.log("| ID | カテゴリ | 名称 | 発行機関 |");
  console.log("|----|---------|------|---------|");
  for (const t of list) {
    console.log(`| ${t.id} | ${t.category} | ${t.name_ja} | ${t.issuer_label_ja ?? t.issuer_type} |`);
  }
}

export function runJpPermitRegistryList(opts: {
  property?: string;
  status?: string;
  json?: boolean;
}): void {
  const registry = loadTenantFile(TENANT_FILES.registry, permitRegistryFileSchema);
  const types = loadCatalog(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  const typeById = types ? typeMap(types.data.permit_types) : new Map<string, PermitTypeEntry>();

  let permits = registry?.data.permits ?? [];
  if (opts.property) permits = permits.filter((p) => p.property_id === opts.property);
  if (opts.status) permits = permits.filter((p) => p.status === opts.status);

  if (opts.json) {
    console.log(JSON.stringify(permits, null, 2));
    return;
  }

  if (!permits.length) {
    console.log("（保有許可なし — permit-registry.yaml に PER-* を登録）");
    return;
  }

  console.log("# 保有許可\n");
  console.log("| ID | 種別 | 名称 | 状態 | 期限 | 物件 |");
  console.log("|----|------|------|------|------|------|");
  for (const p of permits) {
    const t = typeById.get(p.permit_type_id);
    console.log(
      `| ${p.id} | ${p.permit_type_id} | ${t?.name_ja ?? "—"} | ${p.status} | ${p.expires_on ?? "—"} | ${p.property_id ?? "—"} |`
    );
  }
}

export function runJpPermitRegistryObligations(opts: {
  type?: string;
  permit?: string;
  json?: boolean;
}): void {
  const obligations = loadCatalog(CATALOG_FILES.obligations, permitObligationsCatalogFileSchema);
  const types = loadCatalog(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  const registry = loadTenantFile(TENANT_FILES.registry, permitRegistryFileSchema);

  if (!obligations) {
    console.error("obligations-catalog.yaml missing");
    process.exit(1);
  }

  let permitTypeId = opts.type;
  if (opts.permit && registry) {
    const found = registry.data.permits.find((p) => p.id === opts.permit);
    if (!found) {
      console.error(`Unknown permit ${opts.permit}`);
      process.exit(1);
    }
    permitTypeId = found.permit_type_id;
  }

  const list = obligations.data.obligations.filter((o) =>
    permitTypeId ? o.permit_type_ids.includes(permitTypeId) : true
  );

  const typeEntry = permitTypeId && types ? typeMap(types.data.permit_types).get(permitTypeId) : undefined;

  if (opts.json) {
    console.log(JSON.stringify({ permit_type_id: permitTypeId, type: typeEntry, obligations: list }, null, 2));
    return;
  }

  console.log(`# 義務一覧 — ${typeEntry?.name_ja ?? permitTypeId ?? "all"}\n`);
  if (!list.length) {
    console.log("（該当なし）");
    return;
  }
  for (const o of list) {
    console.log(`- **${o.id}** ${o.title}（${o.category}${o.frequency ? ` · ${o.frequency}` : ""}）`);
    if (o.legal_basis) console.log(`  - 根拠: ${o.legal_basis}`);
    if (o.evidence_ledger) console.log(`  - 証跡: ${o.evidence_ledger}`);
  }
}

export interface PermitGapItem {
  kind: "expiry" | "prerequisite" | "obligation_due" | "obligation_overdue" | "pending_permit";
  permit_id?: string;
  permit_type_id?: string;
  obligation_id?: string;
  message: string;
  due?: string;
}

function activePermits(permits: PermitInstanceEntry[]): PermitInstanceEntry[] {
  return permits.filter((p) => ["active", "pending", "applying"].includes(p.status));
}

export function runJpPermitRegistryGap(opts: { json?: boolean }): void {
  const types = loadCatalog(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  const registry = loadTenantFile(TENANT_FILES.registry, permitRegistryFileSchema);
  const instances = loadTenantFile(TENANT_FILES.obligationInstances, permitObligationInstancesFileSchema);
  const gaps: PermitGapItem[] = [];
  const today = currentDate();

  const permits = registry?.data.permits ?? [];
  const typeById = types ? typeMap(types.data.permit_types) : new Map<string, PermitTypeEntry>();
  const heldTypeIds = new Set(permits.filter((p) => p.status === "active").map((p) => p.permit_type_id));

  for (const p of activePermits(permits)) {
    if (p.expires_on) {
      const days = daysUntil(p.expires_on);
      if (days < 0) {
        gaps.push({
          kind: "expiry",
          permit_id: p.id,
          permit_type_id: p.permit_type_id,
          message: `許可期限超過: ${typeById.get(p.permit_type_id)?.name_ja ?? p.permit_type_id}`,
          due: p.expires_on,
        });
      } else if (days <= 90) {
        gaps.push({
          kind: "expiry",
          permit_id: p.id,
          permit_type_id: p.permit_type_id,
          message: `許可期限 ${days} 日以内: ${typeById.get(p.permit_type_id)?.name_ja ?? p.permit_type_id}`,
          due: p.expires_on,
        });
      }
    }
    if (p.status === "pending" || p.status === "applying") {
      gaps.push({
        kind: "pending_permit",
        permit_id: p.id,
        permit_type_id: p.permit_type_id,
        message: `未取得・申請中: ${typeById.get(p.permit_type_id)?.name_ja ?? p.permit_type_id}`,
      });
    }
  }

  for (const p of permits.filter((x) => x.status === "active")) {
    const t = typeById.get(p.permit_type_id);
    if (!t?.prerequisite_type_ids?.length) continue;
    for (const pre of t.prerequisite_type_ids) {
      if (!heldTypeIds.has(pre)) {
        gaps.push({
          kind: "prerequisite",
          permit_id: p.id,
          permit_type_id: p.permit_type_id,
          message: `前提許可不足: ${t.name_ja} に必要な ${typeById.get(pre)?.name_ja ?? pre}`,
        });
      }
    }
  }

  for (const inst of instances?.data.instances ?? []) {
    if (!inst.next_due) continue;
    const days = daysUntil(inst.next_due);
    if (inst.status === "overdue" || days < 0) {
      gaps.push({
        kind: "obligation_overdue",
        permit_id: inst.permit_id,
        obligation_id: inst.obligation_id,
        message: `義務期限超過: ${inst.obligation_id}`,
        due: inst.next_due,
      });
    } else if (inst.status === "due" || days <= (inst.next_due ? 30 : 0)) {
      gaps.push({
        kind: "obligation_due",
        permit_id: inst.permit_id,
        obligation_id: inst.obligation_id,
        message: `義務期限 ${days} 日以内: ${inst.obligation_id}`,
        due: inst.next_due,
      });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ as_of: today, gaps }, null, 2));
    return;
  }

  console.log(`# 許認可 gap 分析（${today}）\n`);
  if (!gaps.length) {
    console.log("（検出なし — テナント台帳が空の場合は正常）");
    return;
  }
  for (const g of gaps) {
    console.log(`- [${g.kind}] ${g.message}${g.due ? `（${g.due}）` : ""}`);
  }
}
