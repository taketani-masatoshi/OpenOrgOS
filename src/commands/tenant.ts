import { runTenantInit, type TenantInitOptions } from "../lib/tenant-init.js";
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
  };
  runTenantInit(options);
  if (opts.validate !== false) {
    process.env.STEWARD_TENANT = id;
    runValidate({});
  }
}
