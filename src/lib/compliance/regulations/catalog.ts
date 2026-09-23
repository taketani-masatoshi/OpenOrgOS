import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  regulationsCatalogSchema,
  type CatalogRegulation,
} from "../../../../schemas/regulations-catalog.js";
import {
  tenantRegulationsFileSchema,
  type TenantRegulationEntry,
} from "../../../../schemas/tenant-regulations.js";
import {
  getRegulationsCatalogPath,
  getRegulationTemplateAbsPath,
  getRegulationTemplateRelPath,
} from "../../jurisdiction.js";
import { getTenantDir } from "../../tenant.js";
import { readYamlFile } from "../../utils.js";

export const REGULATIONS_FILE = "regulations.yaml";
export const TENANT_REGULATIONS_SUBDIR = "company/regulations";

export function regulationsFilePath(): string {
  return join(getTenantDir(), REGULATIONS_FILE);
}

export function loadRegulationsCatalog() {
  const path = getRegulationsCatalogPath();
  if (!existsSync(path)) return { regulations: [] as CatalogRegulation[] };
  return readYamlFile(path, regulationsCatalogSchema);
}

export function loadTenantRegulationsFile() {
  const path = regulationsFilePath();
  if (!existsSync(path)) return { regulations: [] as TenantRegulationEntry[] };
  return readYamlFile(path, tenantRegulationsFileSchema);
}

export function getCatalogRegulation(id: string): CatalogRegulation | undefined {
  return loadRegulationsCatalog().regulations.find((regulation) => regulation.id === id);
}

export function listCatalogRegulationIds(): string[] {
  return loadRegulationsCatalog()
    .regulations.map((regulation) => regulation.id)
    .sort();
}

export { getRegulationsCatalogPath, getRegulationTemplateAbsPath, getRegulationTemplateRelPath };
