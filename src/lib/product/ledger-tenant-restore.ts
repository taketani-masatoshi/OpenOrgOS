import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { getInstallRoot, getTenantsDir } from "../orgos-paths.js";
import { runValidateReport } from "../../commands/validate.js";
import { runWithTenantId } from "../tenant.js";

function alignTenantYamlId(tenantRoot: string, tenantId: string): void {
  const path = join(tenantRoot, "tenant.yaml");
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf-8");
  if (!/^id:\s*.+$/m.test(raw)) return;
  writeFileSync(path, raw.replace(/^id:\s*.+$/m, `id: ${tenantId}`), "utf-8");
}

/** Ledger product restore gate — journal + subscription + operators present. */
export function validateLedgerProductTenant(tenantId: string): boolean {
  const root = join(getTenantsDir(), tenantId);
  const required = [
    "tenant.yaml",
    "modules.yaml",
    "data/finance/journal-entries.yaml",
    "data/product/subscription.yaml",
    "data/org/operators.yaml",
  ];
  return required.every((rel) => existsSync(join(root, rel)));
}

export function restoreLedgerTenantArchive(input: {
  tenantId: string;
  archivePath: string;
  force?: boolean;
}): { tenant_id: string; path: string; validate_ok: boolean } {
  const tenantId = input.tenantId.trim().toLowerCase();
  const archivePath = input.archivePath;
  if (!existsSync(archivePath)) {
    throw new Error(`Archive not found: ${archivePath}`);
  }
  const tenantRoot = join(getTenantsDir(), tenantId);
  if (existsSync(tenantRoot) && !input.force) {
    throw new Error(
      `Tenant directory exists: ${tenantRoot} (pass force: true to overwrite)`,
    );
  }
  if (existsSync(tenantRoot)) {
    rmSync(tenantRoot, { recursive: true, force: true });
  }
  mkdirSync(tenantRoot, { recursive: true });
  execSync(`tar -xzf "${archivePath}" -C "${tenantRoot}"`, { stdio: "ignore" });
  alignTenantYamlId(tenantRoot, tenantId);
  const validate = runWithTenantId(tenantId, () =>
    runValidateReport({ warnings: true }),
  );
  return {
    tenant_id: tenantId,
    path: tenantRoot,
    validate_ok: validate.ok,
  };
}

export function defaultRestoreStagingDir(tenantId: string): string {
  return join(getInstallRoot(), ".restore", tenantId);
}
