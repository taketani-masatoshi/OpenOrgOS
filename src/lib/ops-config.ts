import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  opsConfigSchema,
  type OpsConfig,
  type OpsConfigP0Audit,
  type OpsConfigP0Contract,
  type OpsConfigP0Records,
  type OpsConfigP0Secrets,
} from "../../schemas/ops-config.js";
import { loadEnabledModules, loadModulesFile } from "./modules.js";
import type { TenantModule } from "../../schemas/modules.js";
import { loadTenantConfig } from "./tenant.js";
import { DATA_DIR, readYamlFile, resolveTenantPath } from "./utils.js";

export const OPS_CONFIG_REL = "data/ops-config.yaml";

export function opsConfigPath(): string {
  return join(DATA_DIR, "ops-config.yaml");
}

export function loadOpsConfig(): OpsConfig | null {
  const path = opsConfigPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, opsConfigSchema);
}

export function getModuleById(moduleId: string): TenantModule | undefined {
  return loadModulesFile().modules.find((m) => m.id === moduleId);
}

export interface OperationsModulePaths {
  moduleId: string;
  operationsPublic?: string;
  operationsSecrets?: string;
  docsRoot?: string;
}

export function listOperationsModules(): OperationsModulePaths[] {
  return loadEnabledModules()
    .filter((m) => m.operations_public || m.operations_secrets)
    .map((m) => ({
      moduleId: m.id,
      operationsPublic: m.operations_public,
      operationsSecrets: m.operations_secrets,
      docsRoot: m.docs_root,
    }));
}

export function getPrimaryOperationsPublicRel(): string | undefined {
  return listOperationsModules().find((m) => m.operationsPublic)?.operationsPublic;
}

export function resolveModuleSecretsPath(moduleId: string): string | undefined {
  const mod = getModuleById(moduleId);
  if (!mod?.operations_secrets) return undefined;
  return resolveTenantPath(mod.operations_secrets);
}

export function resolveModulePublicPath(moduleId: string): string | undefined {
  const mod = getModuleById(moduleId);
  if (!mod?.operations_public) return undefined;
  return resolveTenantPath(mod.operations_public);
}

export function resolveRecordsProbePath(moduleId: string, probeFile: string): string | undefined {
  const mod = getModuleById(moduleId);
  if (!mod?.docs_root) return undefined;
  const root = mod.docs_root.endsWith("/") ? mod.docs_root : `${mod.docs_root}/`;
  return resolveTenantPath(`${root}${probeFile}`);
}

export function resolveTenantDocPath(tenantRel: string): string {
  return resolveTenantPath(tenantRel);
}

export function getFiscalYearRange(): { id: string; from: string; to: string; planFile?: string } {
  const cfg = loadOpsConfig()?.fiscal_year;
  return {
    id: cfg?.id ?? "FY2026",
    from: cfg?.from ?? "2026-02",
    to: cfg?.to ?? "2027-01",
    planFile: cfg?.plan_file,
  };
}

export function getP0Contracts(): OpsConfigP0Contract[] {
  return loadOpsConfig()?.p0?.contracts ?? [];
}

export function getP0Secrets(): OpsConfigP0Secrets[] {
  return loadOpsConfig()?.p0?.secrets ?? [];
}

export function getP0Records(): OpsConfigP0Records[] {
  return loadOpsConfig()?.p0?.records ?? [];
}

export function getP0Audits(): OpsConfigP0Audit[] {
  return loadOpsConfig()?.p0?.audits ?? [];
}

export function getP0CashBalanceConfig() {
  return loadOpsConfig()?.p0?.cash_balance;
}

export function listOperationsCatalogPaths(): string[] {
  const paths: string[] = [];
  for (const mod of listOperationsModules()) {
    if (mod.operationsPublic) paths.push(mod.operationsPublic);
    if (mod.operationsSecrets) paths.push(mod.operationsSecrets);
  }
  return paths;
}

export function isSkeletonTenant(): boolean {
  const cfg = loadTenantConfig();
  if (cfg.lifecycle === "skeleton") return true;
  if (cfg.lifecycle === "operational") return false;
  return loadOpsConfig()?.skeleton === true;
}
