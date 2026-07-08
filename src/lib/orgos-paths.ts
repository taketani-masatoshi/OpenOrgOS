import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function hasFrameworkMarkers(dir: string): boolean {
  return existsSync(join(dir, "steward", "core")) && existsSync(join(dir, "schemas"));
}

function detectInstallRoot(): string {
  if (process.env.ORGOS_HOME?.trim()) {
    return resolve(process.env.ORGOS_HOME.trim());
  }

  const candidates = [
    join(__dirname, "..", ".."),
    join(__dirname, "..", "..", ".."),
    join(__dirname, "..", "..", "..", ".."),
  ];

  for (const candidate of candidates) {
    if (hasFrameworkMarkers(candidate)) {
      return resolve(candidate);
    }
  }

  return resolve(join(__dirname, "..", ".."));
}

function dirHasTenants(workspaceDir: string): boolean {
  const tenantsDir = join(workspaceDir, "tenants");
  if (!existsSync(tenantsDir)) return false;
  return readdirSync(tenantsDir, { withFileTypes: true }).some(
    (d) =>
      d.isDirectory() &&
      !d.name.startsWith(".") &&
      !d.name.startsWith("_") &&
      existsSync(join(tenantsDir, d.name, "tenant.yaml"))
  );
}

function findWorkspaceRootFrom(startDir: string): string | undefined {
  let dir = resolve(startDir);
  for (let depth = 0; depth < 24; depth++) {
    if (existsSync(join(dir, "orgos.yaml"))) return dir;
    if (dirHasTenants(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function detectWorkspaceRoot(installRoot: string): string {
  if (process.env.ORGOS_WORKSPACE?.trim()) {
    return resolve(process.env.ORGOS_WORKSPACE.trim());
  }

  const fromCwd = findWorkspaceRootFrom(process.cwd());
  if (fromCwd) return fromCwd;

  if (existsSync(join(installRoot, "tenants"))) {
    return installRoot;
  }

  return installRoot;
}

let _installRoot = detectInstallRoot();
let _workspaceRoot = detectWorkspaceRoot(_installRoot);

export function refreshOrgOsPaths(): void {
  _installRoot = detectInstallRoot();
  _workspaceRoot = detectWorkspaceRoot(_installRoot);
}

export function getInstallRoot(): string {
  return _installRoot;
}

export function getWorkspaceRoot(): string {
  return _workspaceRoot;
}

/** Tenant / company data root (workspace). */
export function getRootDir(): string {
  return _workspaceRoot;
}

/** @deprecated Use getRootDir() or getWorkspaceRoot() */
export const ROOT_DIR = _workspaceRoot;

export function getTenantsDir(): string {
  return join(_workspaceRoot, "tenants");
}

export function getTenantTemplateDir(): string {
  return join(_installRoot, "tenants", "_template");
}

export function getFrameworkDocsDir(): string {
  return join(_installRoot, "docs");
}

export function getDeployDir(): string {
  return join(_installRoot, "deploy");
}

export function getAppsDir(): string {
  return join(_installRoot, "apps");
}

export function getSchemasDir(): string {
  return join(_installRoot, "schemas");
}

export function workspaceConfigPath(): string {
  return join(_workspaceRoot, "orgos.yaml");
}

export function isExternalWorkspace(): boolean {
  return resolve(_workspaceRoot) !== resolve(_installRoot);
}

/** @deprecated Use getTenantsDir() */
export const TENANTS_DIR = join(_workspaceRoot, "tenants");

export const FRAMEWORK_DOCS_DIR = join(_installRoot, "docs");
export const TENANT_TEMPLATE_DIR = join(_installRoot, "tenants", "_template");
