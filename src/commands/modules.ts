import {
  checkAllModules,
  checkModule,
  listCatalogModuleIds,
  listTenantModules,
  loadEnabledModules,
} from "../lib/modules.js";
import {
  activateTenantModule,
  formatActivateModuleResult,
} from "../lib/agent-workspace.js";
import { validateExtensibilityContracts } from "../lib/extensibility-contract.js";
import {
  syncActiveContext,
} from "../lib/context-manifest.js";
import { loadEnabledIsoIds } from "../lib/tenant-standards.js";
import {
  listEffectiveRegulations,
  loadEnabledRegulationIds,
} from "../lib/regulations.js";
import { getTenantId, setTenantId } from "../lib/tenant.js";
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
  const extIssues = validateExtensibilityContracts();

  if (issues.length === 0 && extIssues.length === 0) {
    const c = countTiers();
    console.log(
      `✓ All ${catalogIds.length} catalog modules OK (${c.production_ready} production_ready · ${c.activation_ready} activation_ready · ${c.skeleton} skeleton)`
    );
    process.exit(0);
  }

  console.error(`✗ modules check --all failed (${issues.length + extIssues.length} issue(s)):`);
  for (const i of issues) {
    console.error(`  [${i.moduleId}] ${i.message}`);
  }
  for (const i of extIssues) {
    console.error(`  [${i.code}] ${i.message}`);
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

export interface ModulesActivateOptions {
  tenant?: string;
  skipRegs?: boolean;
  skipIso?: boolean;
  skipControls?: boolean;
  json?: boolean;
}

export function runModulesActivate(moduleId: string, opts: ModulesActivateOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const result = activateTenantModule(moduleId, {
    skipRegs: opts.skipRegs,
    skipIso: opts.skipIso,
    skipControls: opts.skipControls,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatActivateModuleResult(result));
}
