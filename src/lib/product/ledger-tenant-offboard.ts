import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir } from "../orgos-paths.js";
import { exportLedgerTenantArchive } from "./ledger-tenant-export.js";
import { loadControlPlane, upsertControlPlaneTenant } from "./ledger-control-plane.js";
import { runWithTenantId } from "../tenant.js";
import { loadLedgerSubscription, saveLedgerSubscription } from "./ledger-subscription.js";
import {
  loadTenantLifecycle,
  saveTenantLifecycle,
} from "../org/tenant-lifecycle.js";
import { tenantLifecycleSchema } from "../../../schemas/org/tenant-lifecycle.js";

export function offboardLedgerTenant(input: {
  tenantId: string;
  exportFirst?: boolean;
  outputPath?: string;
  purge?: boolean;
  purgeNow?: boolean;
  graceDays?: number;
}): {
  tenant_id: string;
  exported_path?: string;
  status: "cancelled" | "purge_scheduled" | "purged";
  purge_after?: string;
} {
  const tenantId = input.tenantId.trim().toLowerCase();
  const tenantRoot = join(getTenantsDir(), tenantId);
  if (!existsSync(tenantRoot)) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  let exportedPath: string | undefined;
  if (input.exportFirst !== false) {
    const output =
      input.outputPath ??
      join(getTenantsDir(), "..", "exports", `${tenantId}-offboard-${Date.now()}.tar.gz`);
    const result = exportLedgerTenantArchive({ tenantId, outputPath: output });
    exportedPath = result.path;
  }

  runWithTenantId(tenantId, () => {
    const sub = loadLedgerSubscription();
    if (sub) {
      saveLedgerSubscription({
        ...sub,
        status: "cancelled",
        updated_at: new Date().toISOString(),
      });
    }

    const lifecycle = loadTenantLifecycle();
    if (lifecycle.status === "winding_down" && exportedPath) {
      const exportId = exportedPath.split("/").pop() ?? exportedPath;
      const retentionUntil =
        new Date(Date.now() + (input.graceDays ?? 365) * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
      saveTenantLifecycle(
        tenantLifecycleSchema.parse({
          ...lifecycle,
          status: "archived",
          archive_export_id: exportId,
          retention_until: retentionUntil,
        }),
      );
    }
  });

  const cp = loadControlPlane().tenants.find((row) => row.tenant_id === tenantId);
  const companyName = cp?.company_name ?? tenantId;

  if (input.purge) {
    const graceDays = input.purgeNow ? 0 : (input.graceDays ?? 30);
    if (graceDays <= 0) {
      rmSync(tenantRoot, { recursive: true, force: true });
      upsertControlPlaneTenant({
        tenantId,
        companyName,
        status: "cancelled",
        purgeAfter: null,
      });
      return { tenant_id: tenantId, exported_path: exportedPath, status: "purged" };
    }
    const purgeAfter = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000).toISOString();
    upsertControlPlaneTenant({
      tenantId,
      companyName,
      status: "cancelled",
      purgeAfter,
    });
    return {
      tenant_id: tenantId,
      exported_path: exportedPath,
      status: "purge_scheduled",
      purge_after: purgeAfter,
    };
  }

  upsertControlPlaneTenant({
    tenantId,
    companyName,
    status: "cancelled",
    purgeAfter: null,
  });

  return { tenant_id: tenantId, exported_path: exportedPath, status: "cancelled" };
}

export function purgeDueLedgerTenants(now = Date.now()): string[] {
  const purged: string[] = [];
  const file = loadControlPlane();
  for (const row of file.tenants) {
    if (!row.purge_after) continue;
    if (Date.parse(row.purge_after) > now) continue;
    const tenantRoot = join(getTenantsDir(), row.tenant_id);
    if (existsSync(tenantRoot)) {
      rmSync(tenantRoot, { recursive: true, force: true });
    }
    upsertControlPlaneTenant({
      tenantId: row.tenant_id,
      companyName: row.company_name,
      status: "cancelled",
      purgeAfter: null,
    });
    purged.push(row.tenant_id);
  }
  return purged;
}
