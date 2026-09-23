import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import { tenantRegulationsFileSchema } from "../../../../schemas/tenant-regulations.js";
import { getRegulationTemplateAbsPath } from "../../jurisdiction.js";
import { loadTenantConfig, tenantDocsPath } from "../../tenant.js";
import {
  TENANT_REGULATIONS_SUBDIR,
  getCatalogRegulation,
  loadRegulationsCatalog,
  loadTenantRegulationsFile,
  regulationsFilePath,
} from "./catalog.js";
import { listEffectiveRegulations } from "./effective.js";

export interface SeedRegulationsOptions {
  ids?: string[];
  force?: boolean;
  dryRun?: boolean;
  includeDisabled?: boolean;
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

function idsToSeed(options: SeedRegulationsOptions): Set<string> {
  const ids = new Set<string>();
  if (options.includeDisabled) {
    for (const entry of loadTenantRegulationsFile().regulations) {
      if (getCatalogRegulation(entry.id)) ids.add(entry.id);
    }
  } else {
    for (const regulation of listEffectiveRegulations()) {
      if (regulation.effective) ids.add(regulation.id);
    }
  }
  for (const id of options.ids ?? []) ids.add(id);
  return ids;
}

export function seedRegulationDocs(options: SeedRegulationsOptions = {}): SeedRegulationsResult {
  const tenantConfig = loadTenantConfig();
  const companyName = tenantConfig.legal_name ?? tenantConfig.name;
  const result: SeedRegulationsResult = { seeded: [], skipped: [], missing: [] };
  for (const id of [...idsToSeed(options)].sort()) {
    const catalogRegulation = getCatalogRegulation(id);
    if (!catalogRegulation) continue;
    const templatePath = getRegulationTemplateAbsPath(catalogRegulation.template);
    const documentPath = tenantDocsPath(TENANT_REGULATIONS_SUBDIR, catalogRegulation.tenant_doc);
    if (!existsSync(templatePath)) {
      result.missing.push(id);
      continue;
    }
    if (existsSync(documentPath) && !options.force) {
      result.skipped.push(id);
      continue;
    }
    const body = applyRegulationPlaceholders(readFileSync(templatePath, "utf-8"), companyName);
    if (!options.dryRun) {
      mkdirSync(dirname(documentPath), { recursive: true });
      writeFileSync(documentPath, body, "utf-8");
    }
    result.seeded.push(id);
  }
  return result;
}

export interface InitRegulationsRegistryOptions {
  enabled?: boolean;
  notes?: string;
}

export function initTenantRegulationsRegistry(
  options: InitRegulationsRegistryOptions = {}
): string[] {
  const enabled = options.enabled ?? false;
  const catalog = loadRegulationsCatalog().regulations;
  const file = tenantRegulationsFileSchema.parse({
    regulations: catalog.map((regulation) => ({ id: regulation.id, enabled })),
  });
  const header =
    "# 社内規程 — JP カタログ全件\n" +
    "# enabled: true の規程のみ Agent が施行文を参照\n" +
    (options.notes ? `# ${options.notes}\n` : "") +
    "\n";
  writeFileSync(regulationsFilePath(), header + YAML.stringify(file), "utf-8");
  return catalog.map((regulation) => regulation.id);
}
