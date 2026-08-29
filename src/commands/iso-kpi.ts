import { setTenantId } from "../lib/tenant.js";
import { buildKpiReport, formatKpiReport } from "../lib/iso-kpi.js";

export interface IsoKpiCliOptions {
  tenant?: string;
  json?: boolean;
  strict?: boolean;
}

export function runIsoKpi(options: IsoKpiCliOptions = {}): void {
  if (options.tenant) setTenantId(options.tenant);
  const report = buildKpiReport();
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatKpiReport(report));
  }
  if (options.strict && report.errors.length > 0) process.exitCode = 1;
}
