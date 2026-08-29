import { existsSync } from "node:fs";
import {
  humanCapacityFileSchema,
  humanCapabilityCatalogSchema,
  type HumanCapacityFile,
  type HumanCapabilityCatalog,
} from "../../../schemas/dispatch-tower.js";
import { HUMAN_CAPABILITY_CATALOG_PATH } from "../steward-paths.js";
import { tenantDataPath } from "../tenant.js";
import { readYamlFile } from "../utils.js";

export function humanCapacityPath(): string {
  return tenantDataPath("org", "human-capacity.yaml");
}

export function loadHumanCapabilityCatalog(): HumanCapabilityCatalog {
  return readYamlFile(HUMAN_CAPABILITY_CATALOG_PATH, humanCapabilityCatalogSchema);
}

export function loadHumanCapacity(): HumanCapacityFile {
  const path = humanCapacityPath();
  if (!existsSync(path)) {
    return humanCapacityFileSchema.parse({
      schema: "orgos.org.human-capacity.v1",
      version: 1,
      members: [],
    });
  }
  return readYamlFile(path, humanCapacityFileSchema);
}

export function validateHumanCapacityFile(): string[] {
  const issues: string[] = [];
  const catalog = loadHumanCapabilityCatalog();
  const catalogIds = new Set(catalog.tags.map((t) => t.id));
  const capacity = loadHumanCapacity();
  for (const member of capacity.members) {
    for (const tag of member.tags) {
      if (!catalogIds.has(tag)) {
        issues.push(`unknown human capability tag: ${tag} (employee ${member.employee_id})`);
      }
    }
  }
  return issues;
}
