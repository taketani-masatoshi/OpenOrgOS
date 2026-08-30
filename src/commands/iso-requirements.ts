import { setTenantId } from "../lib/tenant.js";
import {
  assessRequirementCoverage,
  formatRequirementCoverage,
  loadRequirements,
} from "../lib/iso-requirements.js";
import { loadEnabledIsoIds } from "../lib/tenant-standards.js";

export interface IsoRequirementsCliOptions {
  tenant?: string;
  iso?: string;
  unverified?: boolean;
  strict?: boolean;
  json?: boolean;
}

export function runIsoRequirements(options: IsoRequirementsCliOptions = {}): void {
  if (options.tenant) setTenantId(options.tenant);

  const standards = (options.iso ? [options.iso] : loadEnabledIsoIds()).filter(
    (id) => loadRequirements(id) !== undefined,
  );
  const coverages = standards.map((id) => assessRequirementCoverage(id));

  if (options.json) {
    console.log(JSON.stringify(coverages, null, 2));
  } else {
    console.log(formatRequirementCoverage(coverages, { unverifiedOnly: options.unverified }));
  }

  const faults = coverages.reduce(
    (n, c) => n + c.uncovered.length + c.dangling.length,
    0,
  );
  if (options.strict && faults > 0) process.exitCode = 1;
}
