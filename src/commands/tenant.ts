import { runTenantInit, scaffoldMissingTenantData, type TenantInitOptions } from "../lib/tenant-init.js";
import { setTenantEnv } from "../lib/orgos-cli.js";
import { setTenantId } from "../lib/tenant.js";
import { runValidate } from "./validate.js";

export function runTenantScaffoldData(opts: { tenant?: string; json?: boolean } = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const result = scaffoldMissingTenantData();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ Scaffold data: ${result.created.length} created, ${result.skipped.length} skipped (exists)`);
  for (const p of result.created) console.log(`  + ${p}`);
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
