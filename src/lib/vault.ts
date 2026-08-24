import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const L2_EXACT_PATHS = new Set([
  "data/finance/bank-accounts.yaml",
  "data/operations/kamezawa-secrets.yaml",
  "data/operations/travel-portals.yaml",
  "data/integrations/integrations.yaml",
  "records/executive/mail-config.yaml",
  "records/executive/mail-received",
]);

function normalizeLogicalPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

export function isVaultLogicalPath(path: string): boolean {
  const normalized = normalizeLogicalPath(path);
  if (normalized.endsWith(".example") || normalized.includes(".example.")) return false;
  if (normalized.split("/").includes("records")) return true;
  return [...L2_EXACT_PATHS].some(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`)
  );
}

export function getVaultRoot(): string | undefined {
  const configured = process.env.ORGOS_VAULT_ROOT?.trim();
  if (!configured) return undefined;
  return resolve(configured);
}

export function tenantVaultRoot(tenantId: string): string | undefined {
  const root = getVaultRoot();
  return root ? join(root, "tenants", tenantId) : undefined;
}

export function resolveVaultLogicalPath(opts: {
  tenantId: string;
  tenantDir: string;
  logicalPath: string;
}): string {
  const normalized = normalizeLogicalPath(opts.logicalPath);
  if (!isVaultLogicalPath(normalized)) return join(opts.tenantDir, normalized);
  const vault = tenantVaultRoot(opts.tenantId);
  if (vault) return join(vault, normalized);
  if (process.env.ORGOS_REQUIRE_EXTERNAL_VAULT === "1") {
    throw new Error(
      `External L2 vault required for ${normalized}; set ORGOS_VAULT_ROOT to a directory outside the workspace`
    );
  }
  return join(opts.tenantDir, normalized);
}

export interface VaultEntryPlan {
  logical_path: string;
  source_path: string;
  destination_path?: string;
  bytes: number;
  state: "legacy" | "migrated" | "conflict";
}

function walkFiles(root: string, current = root): string[] {
  if (!existsSync(current)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(root, path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function planVaultMigration(opts: {
  tenantId: string;
  tenantDir: string;
}): VaultEntryPlan[] {
  const vaultRoot = tenantVaultRoot(opts.tenantId);
  return walkFiles(opts.tenantDir)
    .map((sourcePath) => ({
      sourcePath,
      logicalPath: normalizeLogicalPath(relative(opts.tenantDir, sourcePath)),
    }))
    .filter(({ logicalPath }) => isVaultLogicalPath(logicalPath))
    .map(({ sourcePath, logicalPath }) => {
      const destinationPath = vaultRoot ? join(vaultRoot, logicalPath) : undefined;
      let state: VaultEntryPlan["state"] = "legacy";
      if (destinationPath && existsSync(destinationPath)) {
        state = digest(sourcePath) === digest(destinationPath) ? "migrated" : "conflict";
      }
      return {
        logical_path: logicalPath,
        source_path: sourcePath,
        destination_path: destinationPath,
        bytes: statSync(sourcePath).size,
        state,
      };
    })
    .sort((a, b) => a.logical_path.localeCompare(b.logical_path));
}

function removeEmptyParents(start: string, stop: string): void {
  let current = dirname(start);
  const boundary = resolve(stop);
  while (current.startsWith(boundary) && current !== boundary) {
    if (!existsSync(current) || readdirSync(current).length > 0) break;
    rmdirSync(current);
    current = dirname(current);
  }
}

export function migrateVault(opts: {
  tenantId: string;
  tenantDir: string;
}): { migrated: string[]; already_migrated: string[] } {
  const root = getVaultRoot();
  if (!root || !isAbsolute(root)) throw new Error("ORGOS_VAULT_ROOT is required");
  const workspace = resolve(opts.tenantDir, "..", "..");
  const rel = relative(workspace, root);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error("ORGOS_VAULT_ROOT must be outside the OrgOS workspace");
  }
  const plan = planVaultMigration(opts);
  const conflict = plan.find((entry) => entry.state === "conflict");
  if (conflict) throw new Error(`Vault conflict: ${conflict.logical_path}`);

  const migrated: string[] = [];
  const already: string[] = [];
  for (const entry of plan) {
    const destination = entry.destination_path!;
    if (entry.state === "migrated") {
      already.push(entry.logical_path);
    } else {
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(entry.source_path, destination);
      if (digest(entry.source_path) !== digest(destination)) {
        throw new Error(`Vault verification failed: ${entry.logical_path}`);
      }
      migrated.push(entry.logical_path);
    }
    unlinkSync(entry.source_path);
    removeEmptyParents(entry.source_path, opts.tenantDir);
  }
  return { migrated, already_migrated: already };
}

export function verifyVault(opts: {
  tenantId: string;
  tenantDir: string;
  workspaceRoot: string;
}): {
  configured: boolean;
  external: boolean;
  vault_root?: string;
  legacy_count: number;
  vault_file_count: number;
  ok: boolean;
} {
  const root = getVaultRoot();
  const tenantRoot = tenantVaultRoot(opts.tenantId);
  const legacy = planVaultMigration(opts);
  const vaultFiles = tenantRoot ? walkFiles(tenantRoot) : [];
  const external = root
    ? relative(resolve(opts.workspaceRoot), root).startsWith("..")
    : false;
  return {
    configured: Boolean(root),
    external,
    vault_root: root,
    legacy_count: legacy.length,
    vault_file_count: vaultFiles.length,
    ok: Boolean(root && external && legacy.length === 0),
  };
}
