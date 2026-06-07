import {
  listCatalogModuleIds,
  listTenantModules,
  loadEnabledModules,
} from "../lib/modules.js";
import {
  syncActiveContext,
  loadEnabledIsoIds,
} from "../lib/context-manifest.js";
import { getTenantId } from "../lib/tenant.js";

export function runModulesList(): void {
  const tenantId = getTenantId();
  const rows = listTenantModules();
  const enabled = loadEnabledModules();
  const iso = loadEnabledIsoIds();

  console.log(`Tenant: ${tenantId}`);
  console.log(`Catalog: steward/modules/ (${listCatalogModuleIds().length} modules)`);
  console.log(`Enabled modules: ${enabled.length}`);
  console.log(`Enabled ISO: ${iso.length}\n`);

  console.log("| Catalog | Tenant id | Enabled | Properties | summary_dir |");
  console.log("|---------|-----------|---------|------------|-------------|");
  for (const r of rows) {
    const props = r.propertyIds?.join(", ") ?? "—";
    console.log(
      `| ${r.catalogId} | ${r.tenantId} | ${r.enabled ? "yes" : "no"} | ${props} | ${r.summaryDir ?? "—"} |`
    );
  }

  if (iso.length) {
    console.log("\nEnabled ISO:", iso.join(", "));
  }
  console.log(
    "\nActive context: tenants/{id}/rules/active_context.md (run: steward modules sync-context)"
  );
}

export function runModulesSyncContext(): void {
  const { contextPath, cursorRulePath } = syncActiveContext();
  console.log("✓ Active context synced.");
  console.log(`  ${contextPath}`);
  console.log(`  ${cursorRulePath}`);
}
