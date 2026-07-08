import { listIsoStandardIds } from "../lib/standards.js";
import { loadEnabledIsoIds, loadTenantStandards } from "../lib/tenant-standards.js";
import { getTenantId } from "../lib/tenant.js";

export function runStandardsList(): void {
  const catalog = listIsoStandardIds();
  const tenant = loadTenantStandards();
  const tenantById = new Map(tenant.iso.map((e) => [e.id, e]));

  console.log(`ISO catalog: steward/standards/iso/ (${catalog.length})\n`);
  console.log("| ID | Tenant enabled | Notes |");
  console.log("|----|----------------|-------|");
  for (const id of catalog) {
    const entry = tenantById.get(id);
    console.log(
      `| ${id} | ${entry?.enabled ? "yes" : "no"} | ${entry?.notes ?? "—"} |`
    );
  }
}

export function runStandardsEnabled(): void {
  const ids = loadEnabledIsoIds();
  console.log(`Enabled ISO (${ids.length}): ${ids.join(", ") || "(none)"}`);
}
