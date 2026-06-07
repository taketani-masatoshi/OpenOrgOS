import {
  listCatalogModuleIds,
  listTenantModules,
  loadEnabledModules,
} from "../lib/modules.js";
import { getTenantId } from "../lib/tenant.js";

export function runModulesList(): void {
  const tenantId = getTenantId();
  const rows = listTenantModules();
  const enabled = loadEnabledModules();

  console.log(`Tenant: ${tenantId}`);
  console.log(`Catalog: steward/modules/ (${listCatalogModuleIds().length} modules)`);
  console.log(`Enabled: ${enabled.length}\n`);

  console.log("| Catalog | Tenant id | Enabled | Properties | summary_dir |");
  console.log("|---------|-----------|---------|------------|-------------|");
  for (const r of rows) {
    const props = r.propertyIds?.join(", ") ?? "—";
    console.log(
      `| ${r.catalogId} | ${r.tenantId} | ${r.enabled ? "yes" : "no"} | ${props} | ${r.summaryDir ?? "—"} |`
    );
  }
}
