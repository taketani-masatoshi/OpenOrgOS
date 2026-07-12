import {
  runTenantInit,
  scaffoldMissingTenantData,
  type TenantInitOptions,
} from "../lib/tenant-init.js";
import {
  alignAllTenantsClassificationRegistry,
  alignClassificationRegistry,
} from "../lib/classification-registry-align.js";
import { setTenantEnv } from "../lib/orgos-cli.js";
import { setTenantId } from "../lib/tenant.js";
import { runValidate } from "./validate.js";

export function runTenantScaffoldData(opts: { tenant?: string; json?: boolean } = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const result = scaffoldMissingTenantData();
  const classification = alignClassificationRegistry({ tenantId: opts.tenant });
  if (opts.json) {
    console.log(JSON.stringify({ ...result, classification }, null, 2));
    return;
  }
  console.log(
    `✓ Scaffold data: ${result.created.length} created, ${result.skipped.length} skipped (exists)`
  );
  for (const p of result.created) console.log(`  + ${p}`);
  if (classification.updated) {
    console.log(
      `✓ classification-registry: +${classification.addedResources.length} resources, +${classification.addedAgents.length} agents`
    );
    for (const id of classification.addedResources) console.log(`  + resource ${id}`);
    for (const id of classification.addedAgents) console.log(`  + agent ${id}`);
  }
}

export function runTenantAlignClassification(opts: {
  tenant?: string;
  all?: boolean;
  dryRun?: boolean;
  json?: boolean;
}): void {
  const results = opts.all
    ? alignAllTenantsClassificationRegistry({ dryRun: opts.dryRun })
    : [alignClassificationRegistry({ tenantId: opts.tenant, dryRun: opts.dryRun })];

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const errors = results.filter((r) => r.error);
  const changed = results.filter((r) => r.updated);
  if (opts.dryRun) {
    console.log(`dry-run — ${changed.length} tenant(s) would update`);
  } else {
    console.log(`✓ classification-registry aligned: ${changed.length} tenant(s) updated`);
  }
  for (const r of changed) {
    console.log(
      `  ${r.tenantId}: +${r.addedResources.length} resources, +${r.addedAgents.length} agents`
    );
    for (const id of r.addedResources) console.log(`    resource ${id}`);
    for (const id of r.addedAgents) console.log(`    agent ${id}`);
  }
  for (const r of errors) {
    console.error(`  ✗ ${r.tenantId}: ${r.error}`);
  }
  if (!opts.dryRun && changed.length > 0) {
    console.log("\nnext: ORGOS_TENANT=<id> npm run orgos -- validate");
  }
  if (errors.length > 0) process.exit(1);
}

export function runTenantInitCommand(
  id: string,
  opts: {
    name?: string;
    from?: string[];
    force?: boolean;
    validate?: boolean;
    jurisdiction?: string;
    entityForm?: string;
    displayLanguage?: string;
    legalSubdivision?: string;
    wireConsole?: boolean;
  }
): void {
  const options: TenantInitOptions = {
    id,
    name: opts.name,
    fromModules: opts.from,
    force: opts.force,
    jurisdiction: opts.jurisdiction,
    entityForm: opts.entityForm,
    displayLanguage: opts.displayLanguage,
    legalSubdivision: opts.legalSubdivision,
    wireConsole: opts.wireConsole,
  };
  runTenantInit(options);
  if (opts.validate !== false) {
    setTenantEnv(id);
    runValidate({});
  }
}
