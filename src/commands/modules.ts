import {
  listCatalogModuleIds,
  listTenantModules,
  loadEnabledModules,
  checkAllModules,
  checkModule,
} from "../lib/modules.js";
import {
  syncActiveContext,
} from "../lib/context-manifest.js";
import { loadEnabledIsoIds } from "../lib/tenant-standards.js";
import {
  listEffectiveRegulations,
  loadEnabledRegulationIds,
} from "../lib/regulations.js";
import { getTenantId } from "../lib/tenant.js";
import { getModuleTier, type ReadinessTier } from "../lib/module-readiness.js";

function countTiers(): Record<ReadinessTier, number> {
  const counts: Record<ReadinessTier, number> = {
    skeleton: 0,
    activation_ready: 0,
    production_ready: 0,
  };
  for (const id of listCatalogModuleIds()) {
    counts[getModuleTier(id)]++;
  }
  return counts;
}

export function runModulesCheck(catalogId: string): void {
  const issues = checkModule(catalogId);
  if (issues.length === 0) {
    console.log(`✓ Module "${catalogId}" manifest OK (tier: ${getModuleTier(catalogId)})`);
    process.exit(0);
  }
  console.error(`✗ Module "${catalogId}" check failed:`);
  for (const i of issues) {
    console.error(`  ${i.message}`);
  }
  process.exit(1);
}

export function runModulesCheckAll(): void {
  const catalogIds = listCatalogModuleIds();
  const issues = checkAllModules();

  if (issues.length === 0) {
    const c = countTiers();
    console.log(
      `✓ All ${catalogIds.length} catalog modules OK (${c.production_ready} production_ready · ${c.activation_ready} activation_ready · ${c.skeleton} skeleton)`
    );
    process.exit(0);
  }

  console.error(`✗ modules check --all failed (${issues.length} issue(s)):`);
  for (const i of issues) {
    console.error(`  [${i.moduleId}] ${i.message}`);
  }
  process.exit(1);
}

export function runModulesList(): void {
  const tenantId = getTenantId();
  const rows = listTenantModules();
  const enabled = loadEnabledModules();
  const iso = loadEnabledIsoIds();
  const regs = loadEnabledRegulationIds();

  console.log(`Tenant: ${tenantId}`);
  console.log(`Catalog: steward/modules/ (${listCatalogModuleIds().length} modules)`);
  console.log(`Enabled modules: ${enabled.length}`);
  console.log(`Enabled ISO: ${iso.length}`);
  console.log(`Effective regulations: ${regs.length}\n`);

  console.log("| Catalog | Tenant id | Enabled | Tier | Properties | summary_dir |");
  console.log("|---------|-----------|---------|------|------------|-------------|");
  for (const r of rows) {
    const props = r.propertyIds?.join(", ") ?? "—";
    const tier = getModuleTier(r.catalogId);
    console.log(
      `| ${r.catalogId} | ${r.tenantId} | ${r.enabled ? "yes" : "no"} | ${tier} | ${props} | ${r.summaryDir ?? "—"} |`
    );
  }

  if (iso.length) {
    console.log("\nEnabled ISO:", iso.join(", "));
  }
  if (regs.length) {
    console.log("Effective regulations:", regs.join(", "));
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
