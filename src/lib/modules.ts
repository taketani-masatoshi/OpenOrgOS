import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import {
  modulesFileSchema,
  type TenantModule,
  type ModulesFile,
  type ModuleAgentId,
} from "../../schemas/modules.js";
import { propertySchema } from "../../schemas/property.js";
import { getTenantDir, ROOT_DIR, tenantDataPath, tenantDocsPath } from "./tenant.js";
import { listYamlFiles, readYamlFile } from "./utils.js";

export const MODULES_FILE = "modules.yaml";
export const STEWARD_MODULES_DIR = join(ROOT_DIR, "steward", "modules");
export const MODULE_SEED_SUBDIR = "seed";

export function getModuleSeedDir(catalogId: string): string {
  return join(STEWARD_MODULES_DIR, catalogId, MODULE_SEED_SUBDIR);
}

export function listModuleSeedFiles(catalogId: string): string[] {
  const seedDir = getModuleSeedDir(catalogId);
  if (!existsSync(seedDir)) return [];
  return readdirSync(seedDir)
    .filter((f) => !f.startsWith(".") && f !== "00-README.md")
    .sort();
}

/** Classification registry agent ids (core + legacy module names). */
export const MODULE_TO_CLASSIFICATION_AGENT: Record<ModuleAgentId, AgentId> = {
  rental: "property_rental",
  hospitality: "hospitality",
  professional_services: "operations",
  venture_capital: "finance",
  saas_subscription: "finance",
  event_space: "operations",
  ecommerce: "finance",
  restaurant: "operations",
  retail_store: "finance",
  clinic: "operations",
  logistics: "operations",
  staffing: "operations",
  construction: "operations",
  education: "operations",
  membership: "finance",
};

const NON_PROPERTY_AGENTS: ModuleAgentId[] = [
  "professional_services",
  "venture_capital",
  "saas_subscription",
  "event_space",
  "ecommerce",
  "restaurant",
  "retail_store",
  "clinic",
  "logistics",
  "staffing",
  "construction",
  "education",
  "membership",
];

export function modulesFilePath(): string {
  return join(getTenantDir(), MODULES_FILE);
}

export function listCatalogModuleIds(): string[] {
  if (!existsSync(STEWARD_MODULES_DIR)) return [];
  return readdirSync(STEWARD_MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .filter((d) => existsSync(join(STEWARD_MODULES_DIR, d.name, "agent.md")))
    .map((d) => d.name)
    .sort();
}

export function getModuleAgentDocPath(catalogId: string): string {
  return join(STEWARD_MODULES_DIR, catalogId, "agent.md");
}

export function loadModulesFile(): ModulesFile {
  const path = modulesFilePath();
  if (!existsSync(path)) {
    throw new Error(`Missing ${MODULES_FILE} in tenant directory`);
  }
  return readYamlFile(path, modulesFileSchema);
}

export function loadEnabledModules(): TenantModule[] {
  return loadModulesFile().modules.filter((m) => m.enabled);
}

export interface ModuleValidationIssue {
  file: string;
  message: string;
}

const AGENT_PROPERTY_TYPES: Record<
  string,
  Array<"rental" | "hotel" | "mixed">
> = {
  rental: ["rental", "mixed"],
  hospitality: ["hotel", "mixed"],
};

export function validateModules(): ModuleValidationIssue[] {
  const issues: ModuleValidationIssue[] = [];
  const logicalFile = MODULES_FILE;
  const catalogIds = new Set(listCatalogModuleIds());

  let modulesFile: ModulesFile;
  try {
    modulesFile = loadModulesFile();
  } catch (e) {
    issues.push({
      file: logicalFile,
      message: e instanceof Error ? e.message : String(e),
    });
    return issues;
  }

  const seenIds = new Set<string>();
  const propertyTypes = new Map<string, string>();

  for (const f of listYamlFiles(join(getTenantDir(), "data", "properties"))) {
    try {
      const prop = readYamlFile(f, propertySchema);
      propertyTypes.set(prop.id, prop.type);
    } catch {
      /* validated separately */
    }
  }

  for (const mod of modulesFile.modules) {
    if (seenIds.has(mod.id)) {
      issues.push({
        file: logicalFile,
        message: `duplicate module id "${mod.id}"`,
      });
    }
    seenIds.add(mod.id);

    if (!catalogIds.has(mod.agent)) {
      issues.push({
        file: logicalFile,
        message: `module "${mod.id}" agent "${mod.agent}" not in catalog (steward/modules/)`,
      });
    } else if (!existsSync(getModuleAgentDocPath(mod.agent))) {
      issues.push({
        file: logicalFile,
        message: `catalog agent missing: steward/modules/${mod.agent}/agent.md`,
      });
    }

    if (!mod.enabled) continue;

    if (mod.agent === "rental" || mod.agent === "hospitality") {
      if (!mod.property_ids?.length) {
        issues.push({
          file: logicalFile,
          message: `module "${mod.id}" (${mod.agent}) requires property_ids when enabled`,
        });
        continue;
      }

      const allowedTypes = AGENT_PROPERTY_TYPES[mod.agent] ?? [];
      for (const propId of mod.property_ids) {
        const pType = propertyTypes.get(propId);
        if (!pType) {
          issues.push({
            file: logicalFile,
            message: `module "${mod.id}" references unknown property ${propId}`,
          });
        } else if (!allowedTypes.includes(pType as "rental" | "hotel" | "mixed")) {
          issues.push({
            file: logicalFile,
            message: `module "${mod.id}" (${mod.agent}) incompatible with ${propId} type "${pType}"`,
          });
        }
      }
    }

    if (NON_PROPERTY_AGENTS.includes(mod.agent) && mod.enabled) {
      if (!mod.data_root) {
        issues.push({
          file: logicalFile,
          message: `module "${mod.id}" (${mod.agent}) requires data_root when enabled`,
        });
      }
    }

    if (mod.docs_root) {
      const abs = tenantDocsPath(
        ...mod.docs_root.replace(/^docs\//, "").split("/")
      );
      if (!existsSync(abs)) {
        issues.push({
          file: logicalFile,
          message: `module "${mod.id}" docs_root not found: ${mod.docs_root}`,
        });
      }
    }

    if (mod.data_root && mod.enabled) {
      const abs = mod.data_root.startsWith("data/")
        ? tenantDataPath(...mod.data_root.replace(/^data\//, "").split("/"))
        : join(getTenantDir(), mod.data_root);
      const seedDir = getModuleSeedDir(mod.agent);
      const hasSeed =
        existsSync(seedDir) && listModuleSeedFiles(mod.agent).length > 0;
      if (!existsSync(abs) && !hasSeed) {
        issues.push({
          file: logicalFile,
          message: `module "${mod.id}" data_root not found: ${mod.data_root} (copy from steward/modules/${mod.agent}/seed/ or set enabled: false)`,
        });
      }
    }

    for (const rel of [mod.operations_public, mod.operations_secrets]) {
      if (!rel) continue;
      const abs = rel.startsWith("data/")
        ? tenantDataPath(...rel.replace(/^data\//, "").split("/"))
        : join(getTenantDir(), rel);
      const exampleAbs = `${abs}.example`;
      const seedExample = join(
        getModuleSeedDir(mod.agent),
        `${abs.split("/").pop()}.example`
      );
      const seedFallback = existsSync(getModuleSeedDir(mod.agent))
        ? readdirSync(getModuleSeedDir(mod.agent)).find(
            (f) =>
              f.endsWith(".example") &&
              (rel.includes("public")
                ? f.includes("public")
                : f.includes("secret"))
          )
        : undefined;
      const seedAbs = seedFallback
        ? join(getModuleSeedDir(mod.agent), seedFallback)
        : seedExample;
      if (
        !existsSync(abs) &&
        !existsSync(exampleAbs) &&
        !existsSync(seedAbs)
      ) {
        issues.push({
          file: logicalFile,
          message: `module "${mod.id}" path not found: ${rel} (tenant .example or steward/modules/${mod.agent}/seed/)`,
        });
      }
    }
  }

  return issues;
}

export interface ModuleListRow {
  catalogId: string;
  tenantId: string;
  enabled: boolean;
  agent: ModuleAgentId;
  propertyIds?: string[];
  summaryDir?: string;
}

export function listTenantModules(): ModuleListRow[] {
  const catalog = listCatalogModuleIds();
  const tenantModules = loadModulesFile().modules;
  const byAgent = new Map(tenantModules.map((m) => [m.agent, m]));

  return catalog.map((catalogId) => {
    const tm = byAgent.get(catalogId as ModuleAgentId);
    return {
      catalogId,
      tenantId: tm?.id ?? "—",
      enabled: tm?.enabled ?? false,
      agent: catalogId as ModuleAgentId,
      propertyIds: tm?.property_ids,
      summaryDir: tm?.summary_dir,
    };
  });
}
