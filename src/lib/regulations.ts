import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  regulationsCatalogSchema,
  type CatalogRegulation,
  type RegulationBind,
} from "../../schemas/regulations-catalog.js";
import {
  tenantRegulationsFileSchema,
  type TenantRegulationEntry,
} from "../../schemas/tenant-regulations.js";
import {
  getRegulationsCatalogPath,
  getRegulationTemplateAbsPath,
  getRegulationTemplateRelPath,
} from "./jurisdiction.js";
import { loadEnabledIsoIds } from "./tenant-standards.js";
import { loadModulesFile } from "./modules.js";
import { getTenantDir, tenantDocsPath, loadTenantConfig } from "./tenant.js";
import { readYamlFile } from "./utils.js";

export const REGULATIONS_FILE = "regulations.yaml";
export const TENANT_REGULATIONS_SUBDIR = "company/regulations";

export function regulationsFilePath(): string {
  return join(getTenantDir(), REGULATIONS_FILE);
}

export function loadRegulationsCatalog() {
  const path = getRegulationsCatalogPath();
  if (!existsSync(path)) {
    return { regulations: [] as CatalogRegulation[] };
  }
  return readYamlFile(path, regulationsCatalogSchema);
}

export function loadTenantRegulationsFile() {
  const path = regulationsFilePath();
  if (!existsSync(path)) {
    return { regulations: [] as TenantRegulationEntry[] };
  }
  return readYamlFile(path, tenantRegulationsFileSchema);
}

export function getCatalogRegulation(id: string): CatalogRegulation | undefined {
  return loadRegulationsCatalog().regulations.find((r) => r.id === id);
}

function isModuleEnabled(moduleId: string): boolean {
  const modules = loadModulesFile().modules;
  return modules.some(
    (m) => m.enabled && (m.id === moduleId || m.agent === moduleId)
  );
}

function isBindSatisfied(bind: RegulationBind, enabledIso: string[]): boolean {
  switch (bind.type) {
    case "core":
      if (bind.group === "governance") return true;
      return enabledIso.length > 0;
    case "iso":
      return enabledIso.includes(bind.iso_id);
    case "iso_any":
      return bind.iso_ids.some((id) => enabledIso.includes(id));
    case "module":
      return isModuleEnabled(bind.module_id);
    default:
      return false;
  }
}

export interface EffectiveRegulation {
  id: string;
  name: string;
  tenantEnabled: boolean;
  effective: boolean;
  catalog: CatalogRegulation;
  tenantDocPath: string;
  templatePath: string;
  blockReason?: string;
}

export function listEffectiveRegulations(): EffectiveRegulation[] {
  const catalog = loadRegulationsCatalog().regulations;
  const tenantFile = loadTenantRegulationsFile();
  const tenantById = new Map(tenantFile.regulations.map((r) => [r.id, r]));
  const enabledIso = loadEnabledIsoIds();

  return catalog.map((cat) => {
    const tenant = tenantById.get(cat.id);
    const tenantEnabled = tenant?.enabled ?? false;
    const bindOk = isBindSatisfied(cat.binds_to, enabledIso);
    const effective = tenantEnabled && bindOk;
    let blockReason: string | undefined;
    if (tenantEnabled && !bindOk) {
      blockReason = describeBindBlock(cat.binds_to);
    }

    return {
      id: cat.id,
      name: cat.name,
      tenantEnabled,
      effective,
      catalog: cat,
      tenantDocPath: `docs/company/regulations/${cat.tenant_doc}`,
      templatePath: getRegulationTemplateRelPath(cat.template),
      blockReason,
    };
  });
}

function describeBindBlock(bind: RegulationBind): string {
  switch (bind.type) {
    case "iso":
      return `ISO ${bind.iso_id} が無効`;
    case "iso_any":
      return `いずれの ISO (${bind.iso_ids.join(", ")}) も無効`;
    case "module":
      return `モジュール ${bind.module_id} が無効`;
    case "core":
      return bind.group === "ms" ? "有効 ISO なし" : "—";
    default:
      return "bind 未充足";
  }
}

export function loadEnabledRegulationIds(): string[] {
  return listEffectiveRegulations()
    .filter((r) => r.effective)
    .map((r) => r.id);
}

export interface RegulationValidationIssue {
  file: string;
  message: string;
}

export function validateRegulations(): RegulationValidationIssue[] {
  const issues: RegulationValidationIssue[] = [];
  const logicalFile = REGULATIONS_FILE;
  const catalog = loadRegulationsCatalog().regulations;
  const catalogIds = new Set(catalog.map((r) => r.id));
  const tenantFile = loadTenantRegulationsFile();
  const seen = new Set<string>();

  for (const entry of tenantFile.regulations) {
    if (seen.has(entry.id)) {
      issues.push({
        file: logicalFile,
        message: `duplicate regulation id "${entry.id}"`,
      });
    }
    seen.add(entry.id);

    if (!catalogIds.has(entry.id)) {
      issues.push({
        file: logicalFile,
        message: `regulation "${entry.id}" not in catalog (${getRegulationsCatalogPath()})`,
      });
      continue;
    }

    const cat = getCatalogRegulation(entry.id)!;
    const templateAbs = getRegulationTemplateAbsPath(cat.template);
    if (!existsSync(templateAbs)) {
      issues.push({
        file: logicalFile,
        message: `missing template: ${getRegulationTemplateRelPath(cat.template)}`,
      });
    }

    const effective = listEffectiveRegulations().find((r) => r.id === entry.id);
    if (entry.enabled && effective?.effective) {
      const docAbs = tenantDocsPath(
        TENANT_REGULATIONS_SUBDIR,
        cat.tenant_doc
      );
      if (!existsSync(docAbs)) {
        issues.push({
          file: logicalFile,
          message: `enabled regulation ${entry.id} missing tenant doc: docs/company/regulations/${cat.tenant_doc}`,
        });
      }
    }

    if (entry.enabled && effective && !effective.effective && effective.blockReason) {
      issues.push({
        file: logicalFile,
        message: `regulation ${entry.id} enabled but ineffective: ${effective.blockReason} (set enabled: false or enable bind target)`,
      });
    }
  }

  return issues;
}

export function listCatalogRegulationIds(): string[] {
  return loadRegulationsCatalog()
    .regulations.map((r) => r.id)
    .sort();
}

export interface SeedRegulationsOptions {
  ids?: string[];
  force?: boolean;
  dryRun?: boolean;
}

export interface SeedRegulationsResult {
  seeded: string[];
  skipped: string[];
  missing: string[];
}

function applyRegulationPlaceholders(content: string, companyName: string): string {
  return content
    .replace(/株式会社サンプル商事/g, companyName)
    .replace(/株式会社サンプル/g, companyName)
    .replace(/例示:.*/g, `例示: ${companyName}`)
    .concat("\n\n---\n\n> [TBD] 施行日・条項詳細はテナント側で確定してください。\n");
}

export function seedRegulationDocs(
  options: SeedRegulationsOptions = {}
): SeedRegulationsResult {
  const companyName = loadTenantConfig().legal_name ?? loadTenantConfig().name;
  const effective = listEffectiveRegulations().filter((r) => r.effective);
  const targetIds = options.ids?.length
    ? new Set(options.ids)
    : new Set(effective.map((r) => r.id));

  const result: SeedRegulationsResult = { seeded: [], skipped: [], missing: [] };

  for (const reg of effective) {
    if (!targetIds.has(reg.id)) continue;
    const cat = reg.catalog;
    const templateAbs = getRegulationTemplateAbsPath(cat.template);
    const docAbs = tenantDocsPath(TENANT_REGULATIONS_SUBDIR, cat.tenant_doc);

    if (!existsSync(templateAbs)) {
      result.missing.push(reg.id);
      continue;
    }
    if (existsSync(docAbs) && !options.force) {
      result.skipped.push(reg.id);
      continue;
    }

    const template = readFileSync(templateAbs, "utf-8");
    const body = applyRegulationPlaceholders(template, companyName);

    if (options.dryRun) {
      result.seeded.push(reg.id);
      continue;
    }

    mkdirSync(join(docAbs, ".."), { recursive: true });
    writeFileSync(docAbs, body, "utf-8");
    result.seeded.push(reg.id);
  }

  return result;
}
