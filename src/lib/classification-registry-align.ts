import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  classificationRegistrySchema,
  type ClassificationRegistry,
} from "../../schemas/classification.js";
import { getTenantTemplateDir, listTenantIds, setTenantId, getTenantId } from "./tenant.js";
import { getTenantsDir } from "./orgos-paths.js";
import { currentDate, readYamlFile, writeYamlFile, getClassificationRegistryYaml } from "./utils.js";

export interface AlignClassificationResult {
  tenantId: string;
  updated: boolean;
  addedResources: string[];
  addedAgents: string[];
  path: string;
  error?: string;
}

function loadTemplateClassificationRegistry(): ClassificationRegistry {
  const path = join(getTenantTemplateDir(), "data", "classification-registry.yaml");
  if (!existsSync(path)) {
    throw new Error(`Missing template classification registry: ${path}`);
  }
  return readYamlFile(path, classificationRegistrySchema);
}

function loadExistingRegistry(
  registryPath: string,
  template: ClassificationRegistry
): ClassificationRegistry {
  if (!existsSync(registryPath)) {
    return classificationRegistrySchema.parse({
      version: template.version,
      as_of: template.as_of,
      levels: template.levels,
      agents: {},
      resources: [],
      rules: template.rules,
    });
  }

  try {
    return readYamlFile(registryPath, classificationRegistrySchema);
  } catch {
    const loose = YAML.parse(readFileSync(registryPath, "utf-8")) as Partial<ClassificationRegistry>;
    const levels = { ...template.levels };
    for (const [key, value] of Object.entries(loose.levels ?? {})) {
      const levelKey = key as keyof typeof levels;
      if (!levels[levelKey]) continue;
      levels[levelKey] = {
        ...levels[levelKey],
        ...value,
        description: value?.description ?? levels[levelKey].description,
        label: value?.label ?? levels[levelKey].label,
        export_allowed: value?.export_allowed ?? levels[levelKey].export_allowed,
      };
    }

    const agents = (loose.agents ?? {}) as ClassificationRegistry["agents"];
    const resources = Array.isArray(loose.resources)
      ? loose.resources.filter((r) => r && typeof r === "object" && "id" in r)
      : [];

    return classificationRegistrySchema.parse({
      version: loose.version ?? template.version,
      as_of: loose.as_of ?? template.as_of,
      levels,
      agents,
      resources,
      rules: loose.rules?.length ? loose.rules : template.rules,
    });
  }
}

/** Merge standard template resources/agents into tenant registry (never removes custom entries). */
export function alignClassificationRegistry(opts?: {
  tenantId?: string;
  dryRun?: boolean;
}): AlignClassificationResult {
  const tenantId = opts?.tenantId ?? getTenantId();
  if (!tenantId) {
    throw new Error("alignClassificationRegistry requires tenantId or active ORGOS_TENANT");
  }

  const tenantPath = join(getTenantsDir(), tenantId, "tenant.yaml");
  if (!existsSync(tenantPath)) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }

  const prevTenant = getTenantId();
  setTenantId(tenantId);

  try {
    const template = loadTemplateClassificationRegistry();
    const registryPath = getClassificationRegistryYaml();
    const existing = loadExistingRegistry(registryPath, template);

    const addedResources: string[] = [];
    const addedAgents: string[] = [];

    const mergedAgents = { ...existing.agents };
    for (const [agentId, def] of Object.entries(template.agents)) {
      const key = agentId as keyof typeof mergedAgents;
      if (!mergedAgents[key]) {
        mergedAgents[key] = def;
        addedAgents.push(agentId);
      }
    }

    const resourceById = new Map(existing.resources.map((r) => [r.id, r]));
    for (const resource of template.resources) {
      if (!resourceById.has(resource.id)) {
        resourceById.set(resource.id, resource);
        addedResources.push(resource.id);
      }
    }

    const updated = addedResources.length > 0 || addedAgents.length > 0;

    if (updated && !opts?.dryRun) {
      const merged: ClassificationRegistry = classificationRegistrySchema.parse({
        ...existing,
        agents: mergedAgents,
        resources: [...resourceById.values()],
        rules: existing.rules?.length ? existing.rules : template.rules,
        as_of: currentDate(),
      });
      writeYamlFile(registryPath, merged);
    }

    return {
      tenantId,
      updated,
      addedResources,
      addedAgents,
      path: registryPath,
    };
  } catch (e) {
    return {
      tenantId,
      updated: false,
      addedResources: [],
      addedAgents: [],
      path: getClassificationRegistryYaml(),
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (prevTenant && prevTenant !== tenantId) setTenantId(prevTenant);
  }
}

export function alignAllTenantsClassificationRegistry(opts?: {
  dryRun?: boolean;
}): AlignClassificationResult[] {
  const results: AlignClassificationResult[] = [];
  for (const tenantId of listTenantIds()) {
    if (tenantId === "_template") continue;
    results.push(alignClassificationRegistry({ tenantId, dryRun: opts?.dryRun }));
  }
  return results;
}
