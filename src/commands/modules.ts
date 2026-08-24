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
import { scaffoldModuleExtensionDocs } from "../lib/tenant-document-zones.js";
import { validateExtensibilityContracts } from "../lib/extensibility-contract.js";
import { checkConcurrentJobsManifest } from "../lib/aia/concurrent-jobs-manifest.js";
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
import {
  computeAllModuleReadiness,
  computeModuleReadiness,
  computeModuleReadinessForTenant,
  formatModuleReadinessReport,
} from "../lib/module-readiness-score.js";

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
  const issues = [...checkAllModules(), ...checkConcurrentJobsManifest()];
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

export interface ModulesScaffoldDocsOptions {
  tenant?: string;
  moduleId?: string;
  json?: boolean;
}

export function runModulesScaffoldDocs(opts: ModulesScaffoldDocsOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const modules = scaffoldModuleExtensionDocs(opts.moduleId);
  if (opts.json) {
    console.log(JSON.stringify({ modules }, null, 2));
    return;
  }
  console.log("✓ Module extension docs scaffolded (Zone B)");
  if (modules.created.length) {
    console.log(`  created: ${modules.created.length}`);
    for (const p of modules.created) console.log(`    + ${p}`);
  } else {
    console.log("  (no new paths — enable modules in modules.yaml or pass module id)");
  }
}

export function runModulesActivate(moduleId: string, opts: ModulesActivateOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const result = activateTenantModule(moduleId, {
    skipRegs: opts.skipRegs,
    skipIso: opts.skipIso,
    skipControls: opts.skipControls,
  });
  const docs = scaffoldModuleExtensionDocs(moduleId);
  if (opts.json) {
    console.log(JSON.stringify({ ...result, docsScaffold: docs }, null, 2));
    return;
  }
  console.log(formatActivateModuleResult(result));
  if (docs.created.length) {
    console.log(`  extension docs created: ${docs.created.join(", ")}`);
  }
}

export interface ModulesReadinessOptions {
  tenant?: string;
  module?: string;
  catalog?: boolean;
  json?: boolean;
  min?: number;
}

export function runModulesReadiness(opts: ModulesReadinessOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const tenantId = getTenantId();

  const results = opts.module
    ? [computeModuleReadiness(opts.module, { tenantId })]
    : opts.catalog
      ? computeAllModuleReadiness()
      : computeModuleReadinessForTenant(tenantId);

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatModuleReadinessReport(results));
  }

  const min = opts.min ?? 0;
  const below = results.filter((r) => r.pct < min);
  if (min > 0 && below.length) process.exit(1);
}
