/**
 * Import a catalog module into tenant modules.yaml as disabled.
 * Enable/disable after import goes through tenant.config approval.
 */
import {
  moduleAgentId,
  modulesFileSchema,
  tenantModuleSchema,
  type TenantModule,
} from "../../schemas/modules.js";
import { MODULE_DEFAULT_DATA_ROOT } from "./module-business-data.js";
import {
  listTenantScopeCatalogModuleIds,
  loadModuleManifest,
  loadModulesFile,
  modulesFilePath,
} from "./modules.js";
import { writeYamlFile } from "./utils.js";
import { withYamlFileLock } from "./yaml-atomic.js";

function slugPath(catalogId: string): string {
  return catalogId.replace(/_/g, "-");
}

function defaultDataRoot(catalogId: string): string {
  const mapped = MODULE_DEFAULT_DATA_ROOT[catalogId];
  const rel = mapped ?? `data/${slugPath(catalogId)}`;
  return rel.endsWith("/") ? rel : `${rel}/`;
}

export function isModuleInstalled(catalogId: string): boolean {
  return loadModulesFile().modules.some((m) => m.id === catalogId || m.agent === catalogId);
}

export function assertCatalogModuleImportable(catalogId: string): void {
  if (!moduleAgentId.safeParse(catalogId).success) {
    throw new Error(`Unknown module schema id: ${catalogId}`);
  }
  if (!listTenantScopeCatalogModuleIds().includes(catalogId)) {
    throw new Error(`Module ${catalogId} is not in this tenant's catalog`);
  }
}

/** Add catalog module to modules.yaml with enabled: false. Does not activate. */
export function importCatalogModule(catalogId: string): TenantModule {
  assertCatalogModuleImportable(catalogId);
  return withYamlFileLock(modulesFilePath(), () => {
    const file = loadModulesFile();
    if (file.modules.some((m) => m.id === catalogId || m.agent === catalogId)) {
      throw new Error(`Module ${catalogId} is already imported`);
    }
    const manifest = loadModuleManifest(catalogId);
    const entry = tenantModuleSchema.parse({
      id: catalogId,
      enabled: false,
      agent: catalogId,
      data_root: defaultDataRoot(catalogId),
      docs_root: `docs/${slugPath(catalogId)}/`,
      summary_dir: `agent-summaries/${slugPath(catalogId)}/`,
      notes: manifest?.notes,
    });
    file.modules.push(entry);
    writeYamlFile(modulesFilePath(), modulesFileSchema.parse(file));
    return entry;
  });
}
