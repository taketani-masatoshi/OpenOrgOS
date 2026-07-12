import { existsSync } from "node:fs";
import { join } from "node:path";
import { tenantStandardsFileSchema } from "../../schemas/tenant-standards.js";
import { listIsoStandardIds } from "./standards.js";
import { getTenantDir } from "./tenant.js";
import { readYamlFile } from "./utils.js";

export const STANDARDS_FILE = "standards.yaml";

export function standardsFilePath(): string {
  return join(getTenantDir(), STANDARDS_FILE);
}

export function loadTenantStandards() {
  const path = standardsFilePath();
  if (!existsSync(path)) {
    return { iso: [] as { id: string; enabled: boolean; notes?: string }[] };
  }
  return readYamlFile(path, tenantStandardsFileSchema);
}

export function loadEnabledIsoIds(): string[] {
  const file = loadTenantStandards();
  const enabled = new Set(file.iso.filter((e) => e.enabled).map((e) => e.id));
  if (enabled.size === 0) return [];
  return listIsoStandardIds().filter((id) => enabled.has(id));
}
