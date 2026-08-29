import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { getInstallRoot, getTenantsDir } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";

const EXPORT_PATHS = [
  "tenant.yaml",
  "modules.yaml",
  "standards.yaml",
  "regulations.yaml",
  "rules",
  "data/finance",
  "data/product",
  "data/org/operators.yaml",
  "data/plans",
  "docs/product",
] as const;

export type TenantExportManifest = {
  tenant_id: string;
  exported_at: string;
  product: "orgos-ledger";
  paths: string[];
};

export function exportLedgerTenantArchive(input: {
  tenantId: string;
  outputPath: string;
}): { path: string; manifest: TenantExportManifest } {
  const tenantRoot = join(getTenantsDir(), input.tenantId);
  if (!existsSync(tenantRoot)) {
    throw new Error(`Tenant not found: ${input.tenantId}`);
  }

  const staging = join(
    getInstallRoot(),
    ".exports",
    `${input.tenantId}-${Date.now()}`,
  );
  mkdirSync(staging, { recursive: true });

  const included: string[] = [];
  for (const rel of EXPORT_PATHS) {
    const src = join(tenantRoot, rel);
    if (!existsSync(src)) continue;
    const dest = join(staging, rel);
    mkdirSync(join(dest, ".."), { recursive: true });
    execSync(`cp -R "${src}" "${dest}"`, { stdio: "ignore" });
    included.push(rel);
  }

  const manifest: TenantExportManifest = {
    tenant_id: input.tenantId,
    exported_at: getClock().now().toISOString(),
    product: "orgos-ledger",
    paths: included,
  };
  writeFileSync(
    join(staging, "export-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  included.push("export-manifest.json");

  mkdirSync(join(input.outputPath, ".."), { recursive: true });
  execSync(`tar -czf "${input.outputPath}" -C "${staging}" .`, {
    stdio: "ignore",
  });
  execSync(`rm -rf "${staging}"`, { stdio: "ignore" });

  return { path: input.outputPath, manifest };
}

export function listTenantBackupCandidates(tenantId: string): string[] {
  const tenantRoot = join(getTenantsDir(), tenantId);
  if (!existsSync(tenantRoot)) return [];
  const rows: string[] = [];
  for (const rel of EXPORT_PATHS) {
    const path = join(tenantRoot, rel);
    if (existsSync(path)) rows.push(rel);
  }
  return rows;
}

export function tenantDataSizeBytes(tenantId: string): number {
  const tenantRoot = join(getTenantsDir(), tenantId);
  if (!existsSync(tenantRoot)) return 0;
  let total = 0;
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else total += statSync(path).size;
    }
  }
  walk(tenantRoot);
  return total;
}
