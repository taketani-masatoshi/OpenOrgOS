import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  tenantStandardsFileSchema,
  type TenantStandardsFile,
} from "../../schemas/tenant-standards.js";
import { listIsoStandardIds } from "./standards.js";
import { getTenantDir } from "./tenant.js";
import { readYamlFile } from "./utils.js";

export const STANDARDS_FILE = "standards.yaml";

export function standardsFilePath(): string {
  return join(getTenantDir(), STANDARDS_FILE);
}

export function loadTenantStandards(): TenantStandardsFile {
  const path = standardsFilePath();
  if (!existsSync(path)) return { iso: [] };
  return readYamlFile(path, tenantStandardsFileSchema);
}

export function loadEnabledIsoIds(): string[] {
  const file = loadTenantStandards();
  const enabled = new Set(
    file.iso.filter((e) => e.enabled).map((e) => e.id)
  );
  if (enabled.size === 0) return [];
  return listIsoStandardIds().filter((id) => enabled.has(id));
}

/** Enabled standards that are in scope for conformity pre-check (not excluded). */
export function loadApplicableIsoIds(): string[] {
  const file = loadTenantStandards();
  const applicable = new Set(
    file.iso
      .filter((e) => e.enabled && e.applicability !== "excluded")
      .map((e) => e.id),
  );
  if (applicable.size === 0) return [];
  return listIsoStandardIds().filter((id) => applicable.has(id));
}

export function loadIsoApplicability(id: string): {
  enabled: boolean;
  applicability: "applicable" | "excluded";
  exclusion_reason?: string;
} {
  const entry = loadTenantStandards().iso.find((e) => e.id === id);
  if (!entry) {
    return { enabled: false, applicability: "applicable" };
  }
  return {
    enabled: entry.enabled,
    applicability: entry.applicability === "excluded" ? "excluded" : "applicable",
    exclusion_reason: entry.exclusion_reason,
  };
}
