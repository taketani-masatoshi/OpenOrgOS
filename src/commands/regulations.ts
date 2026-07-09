import {
  listEffectiveRegulations,
  loadEnabledRegulationIds,
  listCatalogRegulationIds,
  seedRegulationDocs,
  validateRegulations,
  initTenantRegulationsRegistry,
} from "../lib/regulations.js";
import { getTenantId } from "../lib/tenant.js";

export function runRegulationsList(): void {
  const tenantId = getTenantId();
  console.log(`Tenant: ${tenantId}`);
  console.log(`Catalog: ${listCatalogRegulationIds().length} regulations\n`);
  console.log("| ID | Name | Tenant | Effective | Doc |");
  console.log("|----|------|--------|-----------|-----|");
  for (const r of listEffectiveRegulations()) {
    console.log(
      `| ${r.id} | ${r.name} | ${r.tenantEnabled ? "yes" : "no"} | ${r.effective ? "yes" : "no"} | ${r.tenantDocPath} |`
    );
    if (r.blockReason) {
      console.log(`| | ↳ ${r.blockReason} | | | |`);
    }
  }
}

export function runRegulationsEffective(): void {
  const ids = loadEnabledRegulationIds();
  console.log(`Effective regulations (${ids.length}): ${ids.join(", ") || "(none)"}`);
}

export function runRegulationsSeed(opts: {
  force?: boolean;
  dryRun?: boolean;
  ids?: string[];
  includeDisabled?: boolean;
}): void {
  const result = seedRegulationDocs({
    force: opts.force,
    dryRun: opts.dryRun,
    ids: opts.ids,
    includeDisabled: opts.includeDisabled,
  });
  if (opts.dryRun) {
    console.log(`Would seed: ${result.seeded.join(", ") || "(none)"}`);
  } else {
    console.log(`✓ Seeded: ${result.seeded.join(", ") || "(none)"}`);
  }
  if (result.skipped.length) {
    console.log(`Skipped (exists): ${result.skipped.join(", ")}`);
  }
  if (result.missing.length) {
    console.error(`Missing templates: ${result.missing.join(", ")}`);
    process.exit(1);
  }
  const issues = validateRegulations();
  if (issues.length) {
    console.error("Validation issues remain:");
    for (const i of issues) console.error(`  ${i.file}: ${i.message}`);
    process.exit(1);
  }
}

export function runRegulationsInit(opts: {
  enabled?: boolean;
  seed?: boolean;
  force?: boolean;
}): void {
  const ids = initTenantRegulationsRegistry({ enabled: opts.enabled ?? false });
  console.log(`✓ regulations.yaml: ${ids.length} entries (enabled: ${opts.enabled ?? false})`);
  if (opts.seed !== false) {
    runRegulationsSeed({ includeDisabled: true, force: opts.force });
  }
}
