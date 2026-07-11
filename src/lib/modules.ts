import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import {
  modulesFileSchema,
  type TenantModule,
  type ModulesFile,
  type ModuleAgentId,
} from "../../schemas/modules.js";

export type { TenantModule, ModulesFile, ModuleAgentId };
import { propertySchema } from "../../schemas/property.js";
import { getTenantDir, ROOT_DIR, tenantDataPath, tenantDocsPath } from "./tenant.js";
import { STEWARD_MODULES_DIR } from "./steward-paths.js";
import { listYamlFiles, readYamlFile } from "./utils.js";
import YAML from "yaml";
import { z } from "zod";
import { loadRegulationsCatalog } from "./regulations.js";
import { loadTenantRegulationsFile } from "./regulations.js";
import { isSkeletonTenant } from "./ops-config.js";
import { getModuleTier, type ReadinessTier } from "./module-readiness.js";
import {
  getJurisdictionPackRoot,
  listJurisdictionCodes,
  type JurisdictionCode,
} from "./jurisdiction.js";
import { getResolvedJurisdiction } from "./jurisdiction.js";

export const MODULES_FILE = "modules.yaml";
export { STEWARD_MODULES_DIR } from "./steward-paths.js";
export const MODULE_SEED_SUBDIR = "seed";
export const PACK_MODULES_SUBDIR = "modules";

export interface ModuleLocation {
  catalogId: string;
  rootDir: string;
  rootRel: string;
  jurisdictionPack?: JurisdictionCode;
}

function listCoreCatalogModuleIds(): string[] {
  if (!existsSync(STEWARD_MODULES_DIR)) return [];
  return readdirSync(STEWARD_MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .filter((d) => existsSync(join(STEWARD_MODULES_DIR, d.name, "agent.md")))
    .map((d) => d.name)
    .sort();
}

function listPackCatalogModuleIds(code: JurisdictionCode): string[] {
  const modulesDir = join(getJurisdictionPackRoot(code), PACK_MODULES_SUBDIR);
  if (!existsSync(modulesDir)) return [];
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .filter((d) => existsSync(join(modulesDir, d.name, "agent.md")))
    .map((d) => d.name)
    .sort();
}

/** Core + 全インストール済み pack のモジュール id */
export function listCatalogModuleIds(): string[] {
  const ids = new Set<string>(listCoreCatalogModuleIds());
  for (const code of listJurisdictionCodes()) {
    for (const id of listPackCatalogModuleIds(code)) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

/** テナント法域に関係するカタログ id（他法域 pack モジュールを除外） */
export function listTenantScopeCatalogModuleIds(): string[] {
  const jurisdiction = getResolvedJurisdiction();
  return listCatalogModuleIds().filter((id) => {
    const loc = resolveModuleLocation(id);
    if (!loc) return false;
    if (!loc.jurisdictionPack) return true;
    return loc.jurisdictionPack === jurisdiction.code;
  });
}

export function resolveModuleLocation(catalogId: string): ModuleLocation | null {
  const coreDir = join(STEWARD_MODULES_DIR, catalogId);
  if (existsSync(join(coreDir, "agent.md"))) {
    return {
      catalogId,
      rootDir: coreDir,
      rootRel: `steward/modules/${catalogId}`,
    };
  }
  for (const code of listJurisdictionCodes()) {
    const packRoot = getJurisdictionPackRoot(code);
    const packModDir = join(packRoot, PACK_MODULES_SUBDIR, catalogId);
    if (existsSync(join(packModDir, "agent.md"))) {
      const packRootRel = packRoot.replace(ROOT_DIR + "/", "").replace(/\\/g, "/");
      return {
        catalogId,
        rootDir: packModDir,
        rootRel: `${packRootRel}/${PACK_MODULES_SUBDIR}/${catalogId}`,
        jurisdictionPack: code,
      };
    }
  }
  return null;
}

export function getModuleRootDir(catalogId: string): string {
  const loc = resolveModuleLocation(catalogId);
  if (!loc) {
    throw new Error(`Unknown module "${catalogId}" — not in steward/modules or jurisdiction-packs`);
  }
  return loc.rootDir;
}

export function getModuleSeedDir(catalogId: string): string {
  return join(getModuleRootDir(catalogId), MODULE_SEED_SUBDIR);
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
  event_operations: "operations",
  ecommerce: "finance",
  restaurant: "operations",
  retail_store: "finance",
  clinic: "operations",
  logistics: "operations",
  staffing: "operations",
  construction: "operations",
  education: "operations",
  membership: "finance",
  software_outsourcing: "operations",
  real_estate_brokerage: "contract",
  property_management: "property_rental",
  travel_booking: "operations",
  language_bridge: "secretary",
  jp_carbon_neutral_2050: "compliance",
  jp_women_empowerment: "compliance",
  jp_privacy_policy: "compliance",
  jp_subsidy_application: "finance",
  jp_trademark_application: "compliance",
  jp_corporate_registration: "secretary",
  jp_medical_device: "medical_device_regulatory",
  jp_permit_registry: "compliance",
  jp_bank_corporate: "finance",
};

const NON_PROPERTY_AGENTS: ModuleAgentId[] = [
  "professional_services",
  "venture_capital",
  "saas_subscription",
  "event_space",
  "event_operations",
  "ecommerce",
  "restaurant",
  "retail_store",
  "clinic",
  "logistics",
  "staffing",
  "construction",
  "education",
  "membership",
  "software_outsourcing",
  "real_estate_brokerage",
  "travel_booking",
  "language_bridge",
  "jp_carbon_neutral_2050",
  "jp_women_empowerment",
  "jp_privacy_policy",
  "jp_subsidy_application",
  "jp_trademark_application",
  "jp_corporate_registration",
  "jp_medical_device",
  "jp_permit_registry",
  "jp_bank_corporate",
];

export function modulesFilePath(): string {
  return join(getTenantDir(), MODULES_FILE);
}

export function getModuleAgentDocPath(catalogId: string): string {
  return join(getModuleRootDir(catalogId), "agent.md");
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

/** Returns [] when modules.yaml is missing or invalid (test / minimal tenants). */
export function loadEnabledModulesSafe(): TenantModule[] {
  try {
    return loadEnabledModules();
  } catch {
    return [];
  }
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
        message: `module "${mod.id}" agent "${mod.agent}" not in catalog`,
      });
    } else if (!resolveModuleLocation(mod.agent)) {
      issues.push({
        file: logicalFile,
        message: `catalog agent missing: ${mod.agent}`,
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
        if (mod.billing?.[propId] && !mod.billing[propId].docs_base) {
          issues.push({
            file: logicalFile,
            message: `module "${mod.id}" billing.${propId} requires docs_base`,
          });
        }
      }
      if (mod.billing) {
        for (const propId of Object.keys(mod.billing)) {
          if (!mod.property_ids?.includes(propId)) {
            issues.push({
              file: logicalFile,
              message: `module "${mod.id}" billing.${propId} not in property_ids`,
            });
          }
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

const moduleManifestSchema = z.object({
  id: z.string(),
  required_seeds: z.array(z.string()).default([]),
  activation_seeds: z.array(z.string()).default([]),
  optional_regulations: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export function loadModuleManifest(catalogId: string) {
  const loc = resolveModuleLocation(catalogId);
  if (!loc) return null;
  const path = join(loc.rootDir, "module.manifest.yaml");
  if (!existsSync(path)) return null;
  return moduleManifestSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export interface ModuleCheckIssue {
  moduleId: string;
  message: string;
}

function checkSeedFiles(
  catalogId: string,
  seeds: string[],
  label: string
): ModuleCheckIssue[] {
  const issues: ModuleCheckIssue[] = [];
  const loc = resolveModuleLocation(catalogId);
  const seedDir = getModuleSeedDir(catalogId);
  for (const seed of seeds) {
    const seedPath = join(seedDir, seed);
    if (!existsSync(seedPath)) {
      issues.push({
        moduleId: catalogId,
        message: `missing ${label} seed: ${loc?.rootRel ?? catalogId}/seed/${seed}`,
      });
    }
  }
  return issues;
}

function checkModuleSkeleton(catalogId: string): ModuleCheckIssue[] {
  const issues: ModuleCheckIssue[] = [];
  const manifest = loadModuleManifest(catalogId);
  if (!manifest) {
    issues.push({ moduleId: catalogId, message: "missing module.manifest.yaml" });
    return issues;
  }

  const seedDir = getModuleSeedDir(catalogId);
  if (!existsSync(seedDir)) {
    const loc = resolveModuleLocation(catalogId);
    issues.push({
      moduleId: catalogId,
      message: `missing seed directory: ${loc?.rootRel ?? catalogId}/seed/`,
    });
  }

  if (!resolveModuleLocation(catalogId)) {
    issues.push({
      moduleId: catalogId,
      message: `missing agent.md for module "${catalogId}"`,
    });
  }

  return issues;
}

export function checkModuleCatalogOnly(catalogId: string, tier: ReadinessTier): ModuleCheckIssue[] {
  const issues = checkModuleSkeleton(catalogId);
  const manifest = loadModuleManifest(catalogId);
  if (!manifest) return issues;
  if (tier === "activation_ready" || tier === "production_ready") {
    issues.push(...checkSeedFiles(catalogId, manifest.activation_seeds, "activation"));
  }
  if (tier === "production_ready") {
    issues.push(...checkSeedFiles(catalogId, manifest.required_seeds, "production"));
  }
  return issues;
}

export function checkModuleByTier(catalogId: string, tier?: ReadinessTier): ModuleCheckIssue[] {
  const t = tier ?? getModuleTier(catalogId);
  const catalogIssues = checkModuleCatalogOnly(catalogId, t);
  if (t === "skeleton") return catalogIssues;
  const manifest = loadModuleManifest(catalogId);
  if (!manifest) return catalogIssues;
  return [...catalogIssues, ...checkModuleTenantBinds(catalogId, manifest)];
}

export function checkModule(catalogId: string): ModuleCheckIssue[] {
  return checkModuleByTier(catalogId);
}

/** Tier-aware catalog sweep for `modules check --all` (tenant binds excluded). */
export function checkAllModules(): ModuleCheckIssue[] {
  const issues: ModuleCheckIssue[] = [];
  for (const id of listCatalogModuleIds()) {
    issues.push(...checkModuleCatalogOnly(id, getModuleTier(id)));
  }
  return issues;
}

function checkModuleTenantBinds(
  catalogId: string,
  manifest: z.infer<typeof moduleManifestSchema>
): ModuleCheckIssue[] {
  const issues: ModuleCheckIssue[] = [];
  let modulesFile: ModulesFile;
  try {
    modulesFile = loadModulesFile();
  } catch {
    return issues;
  }

  const tenantMod = modulesFile.modules.find((m) => m.id === catalogId);
  if (!tenantMod) return issues;

  const catalog = loadRegulationsCatalog();
  const tenantRegs = loadTenantRegulationsFile();
  for (const entry of tenantRegs.regulations) {
    if (!entry.enabled) continue;
    const cat = catalog.regulations.find((r) => r.id === entry.id);
    if (
      cat?.binds_to.type === "module" &&
      cat.binds_to.module_id === catalogId &&
      !tenantMod.enabled
    ) {
      issues.push({
        moduleId: catalogId,
        message: `bind conflict: ${entry.id} enabled in regulations.yaml but module "${catalogId}" is disabled`,
      });
    }
  }

  if (tenantMod.enabled) {
    const needsProperties = catalogId === "rental" || catalogId === "hospitality";
    if (needsProperties && (!tenantMod.property_ids || tenantMod.property_ids.length === 0)) {
      issues.push({
        moduleId: catalogId,
        message: `enabled module "${catalogId}" missing property_ids in modules.yaml`,
      });
    }

    const needsBilling = manifest.required_seeds.some((s) => s.startsWith("invoice-"));
    if (needsBilling && tenantMod.property_ids?.length && !isSkeletonTenant()) {
      for (const propId of tenantMod.property_ids) {
        if (!tenantMod.billing?.[propId]) {
          issues.push({
            moduleId: catalogId,
            message: `billing.${propId} unset — invoice generate requires modules.yaml billing block`,
          });
        }
      }
    }
  }

  return issues;
}
