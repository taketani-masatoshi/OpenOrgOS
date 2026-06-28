import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { z } from "zod";
import { resolveTenantFromEnv, ORGOS_TENANT_ENV, LEGACY_TENANT_ENV } from "./orgos-cli.js";

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
  lifecycle: z.enum(["skeleton", "operational", "test"]).optional(),
  jurisdiction: z
    .string()
    .regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 jurisdiction code")
    .optional(),
  entity_form: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "entity form id from jurisdiction entity-forms.yaml")
    .optional(),
  /** Display language (ja · en · …) — independent from jurisdiction */
  display_language: z.enum(["ja", "en", "zh-Hant", "zh-Hans", "et", "ms", "ar", "ru", "de"]).optional(),
  /** Legal subdivision (e.g. DE for Delaware under US pack) */
  legal_subdivision: z.string().optional(),
  /** Legacy BCP 47 display tag; use display_language when possible */
  locale: z.string().optional(),
  default_currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  /** Opt-in localhost Wire Console (default false). */
  wire_console: z.boolean().optional(),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

let _tenantId: string | null = null;

const TENANT_ID_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Validate a tenant id and confirm it resolves to a real tenant directory
 * inside `tenants/`. Rejects path traversal (`../`, absolute paths, separators)
 * and unknown tenants before any path is derived from it.
 */
function assertValidTenantId(id: string): string {
  const trimmed = id.trim();
  if (!TENANT_ID_PATTERN.test(trimmed)) {
    throw new Error(`Invalid tenant id "${id}" (allowed characters: a-z 0-9 _ -)`);
  }
  const dir = resolve(TENANTS_DIR, trimmed);
  const rel = relative(TENANTS_DIR, dir);
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

  if (existsSync(join(TENANTS_DIR, "mal", "tenant.yaml"))) {
    _tenantId = "mal";
    return _tenantId;
  }

  throw new Error(
    `No tenant configured. Set ${ORGOS_TENANT_ENV} (or ${LEGACY_TENANT_ENV}) or create tenants/{id}/tenant.yaml`
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
