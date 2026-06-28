import { runTenantInit, type TenantInitOptions } from "../lib/tenant-init.js";
import { setTenantEnv } from "../lib/orgos-cli.js";
import { runValidate } from "./validate.js";

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
