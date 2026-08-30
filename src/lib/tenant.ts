import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { resolveTenantFromEnv, ORGOS_TENANT_ENV, LEGACY_TENANT_ENV } from "./orgos-cli.js";
import {
  getInstallRoot,
  getWorkspaceRoot,
  getTenantsDir,
  getFrameworkDocsDir,
  getTenantTemplateDir,
} from "./orgos-paths.js";
import {
  isVaultLogicalPath,
  resolveVaultLogicalPath,
  tenantVaultRoot,
} from "./vault.js";

/** Per-request tenant override (Wire / Console). Does not mutate process default. */
const tenantAls = new AsyncLocalStorage<string>();

export {
  getInstallRoot,
  getWorkspaceRoot,
  getTenantsDir,
  getFrameworkDocsDir,
  getTenantTemplateDir,
} from "./orgos-paths.js";

/** @deprecated Use getWorkspaceRoot() */
export function getRootDir(): string {
  return getWorkspaceRoot();
}

/** @deprecated Use getWorkspaceRoot() */
export const ROOT_DIR = getWorkspaceRoot();

export const TENANTS_DIR = getTenantsDir();
export const FRAMEWORK_DOCS_DIR = getFrameworkDocsDir();
export const TENANT_TEMPLATE_DIR = getTenantTemplateDir();

const tenantConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  legal_name: z.string().optional(),
  display_name: z.string().optional(),
  description: z.string().optional(),
  default: z.boolean().optional(),
  lifecycle: z.enum(["skeleton", "operational", "test"]).optional(),
  /**
   * Explicitly separates framework/fixture work from company operations.
   * `development` must not be used to mutate tenant canonical business data.
   */
  operation_mode: z.enum(["development", "tenant"]).optional(),
  jurisdiction: z
    .string()
    .regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 jurisdiction code")
    .optional(),
  entity_form: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "entity form id from jurisdiction entity-forms.yaml")
    .optional(),
  display_language: z.enum(["ja", "en", "zh-Hant", "zh-Hans", "et", "ms", "ar", "ru", "de"]).optional(),
  legal_subdivision: z.string().optional(),
  locale: z.string().optional(),
  default_currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  wire_console: z.boolean().optional(),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;
export type TenantOperationMode = "development" | "tenant";

let _tenantId: string | null = null;

const TENANT_ID_PATTERN = /^[a-z0-9_-]+$/;

function assertValidTenantId(id: string): string {
  const trimmed = id.trim();
  if (!TENANT_ID_PATTERN.test(trimmed)) {
    throw new Error(`Invalid tenant id "${id}" (allowed characters: a-z 0-9 _ -)`);
  }
  const tenantsDir = getTenantsDir();
  const dir = resolve(tenantsDir, trimmed);
  const rel = relative(tenantsDir, dir);
  if (rel === "" || rel.startsWith("..") || rel.includes("/") || rel.includes("\\")) {
    throw new Error(`Tenant id "${id}" escapes tenants/`);
  }
  if (!existsSync(join(dir, "tenant.yaml"))) {
    throw new Error(`Unknown tenant "${trimmed}": tenants/${trimmed}/tenant.yaml not found`);
  }
  return trimmed;
}

export function setTenantId(id: string): void {
  _tenantId = assertValidTenantId(id);
}

/** Run `fn` with a request-scoped tenant (safe under concurrent Wire + Chat). */
export function runWithTenantId<T>(tenantId: string, fn: () => T): T {
  return tenantAls.run(assertValidTenantId(tenantId), fn);
}

export async function runWithTenantIdAsync<T>(
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantAls.run(assertValidTenantId(tenantId), fn);
}

export function listTenantIds(): string[] {
  const tenantsDir = getTenantsDir();
  if (!existsSync(tenantsDir)) return [];
  return readdirSync(tenantsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .filter((d) => existsSync(join(tenantsDir, d.name, "tenant.yaml")))
    .map((d) => d.name);
}

function readTenantConfig(tenantId: string): TenantConfig {
  const path = join(getTenantsDir(), tenantId, "tenant.yaml");
  const raw = readFileSync(path, "utf-8");
  const parsed = tenantConfigSchema.parse(YAML.parse(raw));
  if (parsed.id !== tenantId) {
    throw new Error(`tenant.yaml id "${parsed.id}" ≠ directory "${tenantId}"`);
  }
  return parsed;
}

export function getTenantId(): string {
  const fromAls = tenantAls.getStore();
  if (fromAls) return fromAls;

  if (_tenantId) return _tenantId;

  const fromEnv = resolveTenantFromEnv();
  if (fromEnv) {
    _tenantId = assertValidTenantId(fromEnv);
    return _tenantId;
  }

  for (const id of listTenantIds()) {
    const config = readTenantConfig(id);
    if (config.default) {
      _tenantId = id;
      return _tenantId;
    }
  }

  if (existsSync(join(getTenantsDir(), "mal", "tenant.yaml"))) {
    _tenantId = "mal";
    return _tenantId;
  }

  throw new Error(
    `No tenant configured. Set ${ORGOS_TENANT_ENV} (or ${LEGACY_TENANT_ENV}) or run: orgos tenant init <id>`
  );
}

export function getTenantDir(): string {
  return join(getTenantsDir(), getTenantId());
}

export function loadTenantConfig(): TenantConfig {
  return readTenantConfig(getTenantId());
}

export function getTenantOperationMode(
  config: TenantConfig = loadTenantConfig()
): TenantOperationMode {
  if (config.operation_mode) return config.operation_mode;
  return config.lifecycle === "test" ? "development" : "tenant";
}

/** `"data"` and `"data/finance"` both belong to the tenant; `"database"` does not. */
function hasZonePrefix(normalized: string, zone: string): boolean {
  return normalized === zone || normalized.startsWith(`${zone}/`);
}

export function resolveTenantPath(logicalPath: string): string {
  const normalized = logicalPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (hasZonePrefix(normalized, "tenants")) {
    return resolve(getWorkspaceRoot(), normalized);
  }
  if (hasZonePrefix(normalized, "steward") || hasZonePrefix(normalized, "schemas")) {
    return resolve(getInstallRoot(), normalized);
  }
  if (
    hasZonePrefix(normalized, "data") ||
    hasZonePrefix(normalized, "docs") ||
    hasZonePrefix(normalized, "records")
  ) {
    if (isVaultLogicalPath(normalized)) {
      return resolveVaultLogicalPath({
        tenantId: getTenantId(),
        tenantDir: getTenantDir(),
        logicalPath: normalized,
      });
    }
    return join(getTenantDir(), normalized);
  }
  return join(getWorkspaceRoot(), normalized);
}

export function toLogicalPath(absPath: string): string {
  const vaultRoot = tenantVaultRoot(getTenantId());
  if (vaultRoot) {
    const vaultRel = relative(vaultRoot, absPath).replace(/\\/g, "/");
    if (!vaultRel.startsWith("..")) return vaultRel;
  }
  const rel = relative(getTenantDir(), absPath).replace(/\\/g, "/");
  if (!rel.startsWith("..")) return rel;
  return relative(getWorkspaceRoot(), absPath).replace(/\\/g, "/");
}

export function tenantDataPath(...segments: string[]): string {
  const logical = join("data", ...segments).replace(/\\/g, "/");
  return isVaultLogicalPath(logical)
    ? resolveVaultLogicalPath({
        tenantId: getTenantId(),
        tenantDir: getTenantDir(),
        logicalPath: logical,
      })
    : join(getTenantDir(), logical);
}

export function tenantDocsPath(...segments: string[]): string {
  return join(getTenantDir(), "docs", ...segments);
}
