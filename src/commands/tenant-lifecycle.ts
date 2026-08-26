import {
  tenantLifecycleSchema,
  type TenantLifecycle,
} from "../../schemas/org/tenant-lifecycle.js";
import {
  loadTenantLifecycle,
  saveTenantLifecycle,
} from "../lib/org/tenant-lifecycle.js";
import { getTenantId } from "../lib/tenant.js";

export function runTenantLifecycleStatus(opts: { json?: boolean }): void {
  const lifecycle = loadTenantLifecycle();
  const out = { tenant: getTenantId(), ...lifecycle };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`Tenant lifecycle (${getTenantId()}): ${lifecycle.status}`);
  if (lifecycle.declared_at) console.log(`  declared_at: ${lifecycle.declared_at}`);
  if (lifecycle.declared_by_operator_id) {
    console.log(`  declared_by: ${lifecycle.declared_by_operator_id}`);
  }
  if (lifecycle.retention_until) console.log(`  retention_until: ${lifecycle.retention_until}`);
  if (lifecycle.archive_export_id) {
    console.log(`  archive_export_id: ${lifecycle.archive_export_id}`);
  }
}

export function runTenantLifecycleDeclareWindingDown(opts: {
  operatorId: string;
  json?: boolean;
}): void {
  const current = loadTenantLifecycle();
  if (current.status !== "active") {
    throw new Error(`cannot declare winding_down from status ${current.status}`);
  }

  const declaredAt = new Date().toISOString().slice(0, 10);
  const next: TenantLifecycle = tenantLifecycleSchema.parse({
    version: "1",
    status: "winding_down",
    declared_at: declaredAt,
    declared_by_operator_id: opts.operatorId.trim(),
  });
  const path = saveTenantLifecycle(next);

  const out = { tenant: getTenantId(), path, ...next };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`✓ tenant lifecycle → winding_down (${path})`);
  console.log(`  declared_by: ${opts.operatorId.trim()} (${declaredAt})`);
}

export function runTenantLifecycleArchive(opts: {
  exportId: string;
  retentionUntil?: string;
  json?: boolean;
}): void {
  const current = loadTenantLifecycle();
  if (current.status !== "winding_down") {
    throw new Error(`archive requires winding_down (current: ${current.status})`);
  }

  const retentionUntil =
    opts.retentionUntil?.trim() ??
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const next: TenantLifecycle = tenantLifecycleSchema.parse({
    ...current,
    status: "archived",
    archive_export_id: opts.exportId.trim(),
    retention_until: retentionUntil,
  });
  const path = saveTenantLifecycle(next);

  const out = { tenant: getTenantId(), path, ...next };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`✓ tenant lifecycle → archived (${path})`);
  console.log(`  archive_export_id: ${opts.exportId.trim()}`);
  console.log(`  retention_until: ${retentionUntil}`);
}
