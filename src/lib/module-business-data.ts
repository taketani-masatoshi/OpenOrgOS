import { existsSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { getModuleSeedDir, loadEnabledModules } from "./modules.js";
import { resolveTenantPath } from "./utils.js";
import { readYamlFile } from "./utils.js";

/** Default tenant data roots when modules.yaml omits data_root */
export const MODULE_DEFAULT_DATA_ROOT: Record<string, string> = {
  professional_services: "data/services",
  saas_subscription: "data/saas",
  property_management: "data/property-management",
  software_outsourcing: "data/software-outsourcing",
  real_estate_brokerage: "data/real-estate-brokerage",
  venture_capital: "data/venture-capital",
  investor_relations: "data/investor-relations",
  customer_success: "data/customers",
  sales: "data/sales",
  membership: "data/membership",
  staffing: "data/staffing",
  ecommerce: "data/ecommerce",
  event_operations: "data/event-operations",
  jp_subsidy_application: "data/subsidy",
  jp_trademark_application: "data/trademark",
  jp_corporate_registration: "data/corporate-registration",
  jp_medical_device: "data/medical-device",
  jp_permit_registry: "data/permit-registry",
  jp_consumption_refund: "data/tax",
};

export function isModuleEnabled(moduleId: string): boolean {
  return loadEnabledModules().some((m) => m.agent === moduleId);
}

export function getModuleDataDir(moduleId: string): string {
  const mod = loadEnabledModules().find((m) => m.agent === moduleId);
  if (mod?.data_root) {
    const rel = mod.data_root.replace(/\/$/, "");
    return resolveTenantPath(rel.endsWith("/") ? rel.slice(0, -1) : rel);
  }
  const fallback = MODULE_DEFAULT_DATA_ROOT[moduleId] ?? `data/${moduleId.replace(/_/g, "-")}`;
  return resolveTenantPath(fallback);
}

export function resolveModuleDataFile(moduleId: string, filename: string): string {
  return join(getModuleDataDir(moduleId), filename);
}

export type ModuleDataLoadSource = "tenant-live" | "tenant" | "tenant-or-seed";

export function loadModuleDataFile<S extends z.ZodTypeAny>(
  moduleId: string,
  filename: string,
  schema: S,
  opts: { source?: ModuleDataLoadSource } = {},
): { data: z.output<S>; path: string } | null {
  const source = opts.source ?? "tenant-or-seed";
  const candidates = [resolveModuleDataFile(moduleId, filename)];
  if (source !== "tenant-live") {
    candidates.push(resolveModuleDataFile(moduleId, `${filename}.example`));
  }
  if (source === "tenant-or-seed") {
    candidates.push(
      join(getModuleSeedDir(moduleId), filename),
      join(getModuleSeedDir(moduleId), `${filename}.example`),
    );
  }

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    return { data: readYamlFile(path, schema), path };
  }
  return null;
}

export function daysUntil(iso: string, from = new Date()): number {
  const target = new Date(`${iso}T12:00:00`);
  const base = new Date(from.toISOString().slice(0, 10) + "T12:00:00");
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}
