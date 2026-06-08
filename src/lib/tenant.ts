import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = join(__dirname, "..", "..");
export const TENANTS_DIR = join(ROOT_DIR, "tenants");
export const FRAMEWORK_DOCS_DIR = join(ROOT_DIR, "docs");

const tenantConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  legal_name: z.string().optional(),
  display_name: z.string().optional(),
  description: z.string().optional(),
  default: z.boolean().optional(),
  lifecycle: z.enum(["skeleton", "operational"]).optional(),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

let _tenantId: string | null = null;

export function setTenantId(id: string): void {
  _tenantId = id;
}

export function listTenantIds(): string[] {
  if (!existsSync(TENANTS_DIR)) return [];
  return readdirSync(TENANTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
    .filter((d) => existsSync(join(TENANTS_DIR, d.name, "tenant.yaml")))
    .map((d) => d.name);
}

function readTenantConfig(tenantId: string): TenantConfig {
  const path = join(TENANTS_DIR, tenantId, "tenant.yaml");
  const raw = readFileSync(path, "utf-8");
  const parsed = tenantConfigSchema.parse(YAML.parse(raw));
  if (parsed.id !== tenantId) {
    throw new Error(`tenant.yaml id "${parsed.id}" ≠ directory "${tenantId}"`);
  }
  return parsed;
}

export function getTenantId(): string {
  if (_tenantId) return _tenantId;

  const fromEnv = process.env.STEWARD_TENANT?.trim();
  if (fromEnv) {
    _tenantId = fromEnv;
    return _tenantId;
  }

  for (const id of listTenantIds()) {
    const config = readTenantConfig(id);
    if (config.default) {
      _tenantId = id;
      return _tenantId;
    }
  }

  if (existsSync(join(TENANTS_DIR, "mal", "tenant.yaml"))) {
    _tenantId = "mal";
    return _tenantId;
  }

  throw new Error(
    "No tenant configured. Set STEWARD_TENANT or create tenants/{id}/tenant.yaml"
  );
}

export function getTenantDir(): string {
  return join(TENANTS_DIR, getTenantId());
}

export function loadTenantConfig(): TenantConfig {
  return readTenantConfig(getTenantId());
}

/** Resolve logical path (data/... or docs/...) to absolute tenant path. */
export function resolveTenantPath(logicalPath: string): string {
  const normalized = logicalPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("tenants/")) {
    return resolve(ROOT_DIR, normalized);
  }
  if (normalized.startsWith("data/") || normalized.startsWith("docs/")) {
    return join(getTenantDir(), normalized);
  }
  return join(ROOT_DIR, normalized);
}

/** Map absolute path to tenant-relative logical path (data/... or docs/...). */
export function toLogicalPath(absPath: string): string {
  const rel = relative(getTenantDir(), absPath).replace(/\\/g, "/");
  if (!rel.startsWith("..")) return rel;
  return relative(ROOT_DIR, absPath).replace(/\\/g, "/");
}

export function tenantDataPath(...segments: string[]): string {
  return join(getTenantDir(), "data", ...segments);
}

export function tenantDocsPath(...segments: string[]): string {
  return join(getTenantDir(), "docs", ...segments);
}
