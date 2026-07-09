import {
  scaffoldCoreTenantDocs,
  scaffoldModuleExtensionDocs,
  scaffoldTenantDocumentZones,
} from "../lib/tenant-document-zones.js";
import { setTenantId } from "../lib/tenant.js";

export interface TenantScaffoldDocsOptions {
  tenant?: string;
  coreOnly?: boolean;
  modulesOnly?: boolean;
  moduleId?: string;
  json?: boolean;
}

function printResult(label: string, result: { created: string[]; skipped: string[] }): void {
  if (result.created.length) {
    console.log(`  ${label} created: ${result.created.length}`);
    for (const p of result.created) console.log(`    + ${p}`);
  }
  if (result.skipped.length) {
    console.log(`  ${label} skipped (exists): ${result.skipped.length}`);
  }
}

export function runTenantScaffoldDocs(opts: TenantScaffoldDocsOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);

  if (opts.modulesOnly) {
    const modules = scaffoldModuleExtensionDocs(opts.moduleId);
    if (opts.json) {
      console.log(JSON.stringify({ modules }, null, 2));
      return;
    }
    console.log("✓ Module extension docs scaffolded (Zone B)");
    printResult("extension", modules);
    return;
  }

  if (opts.coreOnly) {
    const core = scaffoldCoreTenantDocs();
    if (opts.json) {
      console.log(JSON.stringify({ core }, null, 2));
      return;
    }
    console.log("✓ Core docs scaffolded (Zone A)");
    printResult("core", core);
    return;
  }

  const { core, modules } = scaffoldTenantDocumentZones({ moduleId: opts.moduleId });
  if (opts.json) {
    console.log(JSON.stringify({ core, modules }, null, 2));
    return;
  }
  console.log("✓ Tenant document zones scaffolded");
  printResult("core (Zone A)", core);
  printResult("extension (Zone B)", modules);
}
