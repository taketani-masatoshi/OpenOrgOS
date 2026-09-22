/**
 * Resolve property_id → project_code from tenant finance/project-codes.yaml.
 * Path: src/lib/finance/project-codes.ts
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  projectCodesFileSchema,
  type ProjectCodesFile,
} from "../../../schemas/finance/project-codes.js";
import { getDataDir, readYamlFile } from "../utils.js";

const REL = "finance/project-codes.yaml";

export function loadProjectCodes(): ProjectCodesFile | undefined {
  const path = join(getDataDir(), REL);
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, projectCodesFileSchema);
}

/** Map property_id to project_code when the tenant registry defines it. */
export function resolveProjectCodeForProperty(
  propertyId: string | undefined,
): string | undefined {
  if (!propertyId) return undefined;
  const file = loadProjectCodes();
  if (!file) return undefined;
  return file.projects.find((p) => p.property_id === propertyId)?.code;
}
