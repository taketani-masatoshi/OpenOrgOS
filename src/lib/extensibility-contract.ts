/**
 * Extensibility contract — cross-layer invariants for catalog · pack · CLI · capability DB.
 * Invoked by `modules check --all` and tests/extensibility-contract.test.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { JP_PACK_MODULE_IDS } from "../../schemas/modules/pack-ids.js";
import { coreEventTypeSchema } from "../../schemas/protocol/org-event.js";
import { protocolRegistrySchema } from "../../schemas/protocol/registry.js";
import { getJurisdictionPackRoot, listJurisdictionCodes } from "./jurisdiction.js";
import { listModuleCliBundles } from "./module-cli.js";
import { getModuleTier, loadModuleReadiness } from "./module-readiness.js";
import {
  listCatalogModuleIds,
  resolveModuleLocation,
} from "./modules.js";
import { ROOT_DIR } from "./tenant.js";
import { PROTOCOL_REGISTRY_PATH, STEWARD_MODULES_DIR } from "./steward-paths.js";
import { readYamlFile } from "./utils.js";

export interface ExtensibilityIssue {
  code: string;
  message: string;
}

const PACK_MANIFEST = "pack.manifest.yaml";

const jpPackManifestSchema = z
  .object({
    declaration_modules: z.array(z.string()).optional(),
  })
  .passthrough();

const packManifestI1Schema = z.object({
  id: z.string().min(1),
  owner: z.object({ org: z.string().min(1) }).passthrough(),
  repository: z.string().min(1),
  capability_catalog: z.string().optional(),
});

function loadJpPackManifest(): z.infer<typeof jpPackManifestSchema> | null {
  const path = join(getJurisdictionPackRoot("JP"), PACK_MANIFEST);
  if (!existsSync(path)) return null;
  return readYamlFile(path, jpPackManifestSchema);
}

/** JP pack.manifest.yaml I1 required fields (id · owner.org · repository) */
export function checkJpPackManifestFields(): ExtensibilityIssue[] {
  const path = join(getJurisdictionPackRoot("JP"), PACK_MANIFEST);
  if (!existsSync(path)) {
    return [{ code: "jp-pack-manifest-missing", message: "JP pack.manifest.yaml not found" }];
  }
  try {
    readYamlFile(path, packManifestI1Schema);
  } catch (e) {
    return [
      {
        code: "jp-pack-manifest-invalid",
        message: e instanceof Error ? e.message : String(e),
      },
    ];
  }
  return [];
}

/** JP pack-ids.ts matches filesystem catalog under jurisdiction-packs/JP/modules/ */
export function checkJpPackModuleIdsSync(): ExtensibilityIssue[] {
  const issues: ExtensibilityIssue[] = [];
  const fsIds = listCatalogModuleIds().filter((id) => id.startsWith("jp_"));
  const declared = new Set<string>(JP_PACK_MODULE_IDS);
  for (const id of fsIds) {
    if (!declared.has(id)) {
      issues.push({
        code: "jp-pack-ids-missing",
        message: `${id} exists in JP/modules but not in schemas/modules/pack-ids.ts`,
      });
    }
  }
  for (const id of JP_PACK_MODULE_IDS) {
    if (!fsIds.includes(id)) {
      issues.push({
        code: "jp-pack-ids-orphan",
        message: `${id} in pack-ids.ts but missing from JP/modules/`,
      });
    }
  }
  return issues;
}

/** pack.manifest declaration_modules matches JP pack module dirs */
export function checkJpDeclarationModulesSync(): ExtensibilityIssue[] {
  const manifest = loadJpPackManifest();
  if (!manifest?.declaration_modules) return [];
  const issues: ExtensibilityIssue[] = [];
  const fsIds = new Set(listCatalogModuleIds().filter((id) => id.startsWith("jp_")));
  for (const id of manifest.declaration_modules) {
    if (!fsIds.has(id)) {
      issues.push({
        code: "jp-declaration-orphan",
        message: `declaration_modules ${id} not found under JP/modules/`,
      });
    }
  }
  return issues;
}

/** readiness.yaml keys match catalog exactly */
export function checkReadinessCatalogSync(): ExtensibilityIssue[] {
  const issues: ExtensibilityIssue[] = [];
  const catalog = new Set(listCatalogModuleIds());
  const readiness = loadModuleReadiness();
  for (const id of catalog) {
    if (!readiness.has(id)) {
      issues.push({ code: "readiness-missing", message: `readiness.yaml missing tier for ${id}` });
    }
  }
  for (const id of readiness.keys()) {
    if (!catalog.has(id)) {
      issues.push({ code: "readiness-orphan", message: `readiness.yaml has unknown module ${id}` });
    }
  }
  return issues;
}

/** Every cli/register.ts is registered in module-cli.ts bundles */
export function checkModuleCliRegistration(): ExtensibilityIssue[] {
  const issues: ExtensibilityIssue[] = [];
  const bundles = new Set(listModuleCliBundles().map((b) => b.moduleId));
  for (const id of listCatalogModuleIds()) {
    const loc = resolveModuleLocation(id);
    if (!loc) continue;
    const registerPath = join(loc.rootDir, "cli", "register.ts");
    if (!existsSync(registerPath)) continue;
    if (!bundles.has(id)) {
      issues.push({
        code: "cli-unregistered",
        message: `${id} has cli/register.ts but is not in MODULE_CLI_BUNDLES`,
      });
    }
  }
  for (const id of bundles) {
    // Platform bundles (e.g. pdf_esign) ship a CLI without a business-module agent.
    const rootDir = resolveModuleLocation(id)?.rootDir ?? join(STEWARD_MODULES_DIR, id);
    if (!existsSync(join(rootDir, "cli", "register.ts"))) {
      issues.push({
        code: "cli-orphan-bundle",
        message: `ModuleCliBundle ${id} has no cli/register.ts`,
      });
    }
  }
  return issues;
}

/** JP business-capability-catalog.yaml integrity (when present) */
export function checkJpCapabilityCatalog(): ExtensibilityIssue[] {
  const yamlPath = join(
    ROOT_DIR,
    "steward/jurisdiction-packs/JP/business-capability-catalog.yaml"
  );
  const csvPath = join(
    ROOT_DIR,
    "steward/jurisdiction-packs/JP/business-capability-catalog.csv"
  );
  if (!existsSync(yamlPath)) return [];
  const issues: ExtensibilityIssue[] = [];
  const doc = YAML.parse(readFileSync(yamlPath, "utf-8")) as {
    agents: Array<{ id: string }>;
    modules: Array<{ id: string }>;
    skills: Array<{ id: string; agent_id: string; module_id?: string | null }>;
    categories: unknown[];
  };

  const agentIds = new Set(doc.agents.map((a) => a.id));
  const moduleIds = new Set(doc.modules.map((m) => m.id));

  for (const skill of doc.skills) {
    if (!agentIds.has(skill.agent_id)) {
      issues.push({
        code: "capability-skill-agent",
        message: `capability skill ${skill.id} references unknown agent ${skill.agent_id}`,
      });
    }
    if (skill.module_id && !moduleIds.has(skill.module_id)) {
      issues.push({
        code: "capability-skill-module",
        message: `capability skill ${skill.id} references unknown module ${skill.module_id}`,
      });
    }
  }

  if (existsSync(csvPath)) {
    const lines = readFileSync(csvPath, "utf-8").trim().split("\n");
    const expectedRows =
      doc.categories.length + doc.agents.length + doc.modules.length + doc.skills.length;
    if (lines.length - 1 !== expectedRows) {
      issues.push({
        code: "capability-csv-drift",
        message: `capability CSV rows ${lines.length - 1} != YAML entities ${expectedRows} — regenerate CSV`,
      });
    }
  }

  return issues;
}

/** All jurisdiction packs with modules/ have pack.manifest.yaml */
export function checkPackManifestsExist(): ExtensibilityIssue[] {
  const issues: ExtensibilityIssue[] = [];
  for (const code of listJurisdictionCodes()) {
    const root = getJurisdictionPackRoot(code);
    const manifestPath = join(root, PACK_MANIFEST);
    if (!existsSync(manifestPath)) {
      if (existsSync(join(root, "modules"))) {
        issues.push({
          code: "pack-manifest-missing",
          message: `jurisdiction ${code} has modules/ but no pack.manifest.yaml`,
        });
      }
      continue;
    }
    if (code === "JP") {
      try {
        readYamlFile(manifestPath, packManifestI1Schema);
      } catch (e) {
        issues.push({
          code: "pack-manifest-invalid",
          message: `JP: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }
  return issues;
}

/** Platform protocol registry matches Zod schema and lists all core event types */
export function checkProtocolRegistry(): ExtensibilityIssue[] {
  const issues: ExtensibilityIssue[] = [];
  if (!existsSync(PROTOCOL_REGISTRY_PATH)) {
    issues.push({
      code: "protocol-registry-missing",
      message: "steward/platform/protocol/registry.yaml not found",
    });
    return issues;
  }
  try {
    const registry = readYamlFile(PROTOCOL_REGISTRY_PATH, protocolRegistrySchema);
    const coreEnum = coreEventTypeSchema.options;
    for (const t of coreEnum) {
      if (!registry.core_event_types.includes(t)) {
        issues.push({
          code: "protocol-core-type-missing",
          message: `registry.yaml missing core event type ${t}`,
        });
      }
      if (registry.core_event_scopes && !registry.core_event_scopes[t]) {
        issues.push({
          code: "protocol-event-scope-missing",
          message: `registry.yaml missing core_event_scopes for ${t}`,
        });
      }
    }
  } catch (e) {
    issues.push({
      code: "protocol-registry-invalid",
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return issues;
}

export function validateExtensibilityContracts(): ExtensibilityIssue[] {
  return [
    ...checkJpPackManifestFields(),
    ...checkJpPackModuleIdsSync(),
    ...checkJpDeclarationModulesSync(),
    ...checkReadinessCatalogSync(),
    ...checkModuleCliRegistration(),
    ...checkJpCapabilityCatalog(),
    ...checkPackManifestsExist(),
    ...checkProtocolRegistry(),
  ];
}

export interface ModuleAxisStats {
  catalogTotal: number;
  productionReady: number;
  activationReady: number;
  skeleton: number;
  productionPct: number;
}

export function computeModuleAxisStats(): ModuleAxisStats {
  const ids = listCatalogModuleIds();
  let productionReady = 0;
  let activationReady = 0;
  let skeleton = 0;
  for (const id of ids) {
    const tier = getModuleTier(id);
    if (tier === "production_ready") productionReady++;
    else if (tier === "activation_ready") activationReady++;
    else skeleton++;
  }
  return {
    catalogTotal: ids.length,
    productionReady,
    activationReady,
    skeleton,
    productionPct: ids.length ? Math.round((productionReady / ids.length) * 100) : 0,
  };
}
