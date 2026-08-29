import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir } from "../orgos-paths.js";

export const LEDGER_PRODUCT_MARKER = "orgos-ledger";

export function readTenantProductMarker(tenantId: string): string | null {
  const tenantYaml = join(getTenantsDir(), tenantId, "tenant.yaml");
  if (!existsSync(tenantYaml)) return null;
  const raw = readFileSync(tenantYaml, "utf-8");
  const match = raw.match(/^product:\s*(\S+)\s*$/m);
  return match?.[1]?.trim() ?? null;
}

export function isLedgerProductTenant(tenantId: string): boolean {
  return readTenantProductMarker(tenantId) === LEDGER_PRODUCT_MARKER;
}

export function listLedgerProductTenantIds(): string[] {
  const tenantsDir = getTenantsDir();
  if (!existsSync(tenantsDir)) return [];
  return readdirSync(tenantsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .filter((tenantId) => isLedgerProductTenant(tenantId))
    .sort();
}

/** Restore/backup drill copies — excluded from fleet-health / accounting readiness. */
export function isLedgerDrillTenant(tenantId: string): boolean {
  return /-drill$/i.test(tenantId) || tenantId.includes("-drill-");
}

/** Active product tenants only (excludes drill sandboxes that pollute health scores). */
export function listActiveLedgerProductTenantIds(): string[] {
  return listLedgerProductTenantIds().filter((id) => !isLedgerDrillTenant(id));
}
