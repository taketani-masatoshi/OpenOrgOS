import { setTenantId } from "../lib/tenant.js";
import { checkRecordsForStandard, formatRecordReports, loadRecordSpecs } from "../lib/iso-records.js";
import { loadEnabledIsoIds } from "../lib/tenant-standards.js";

export interface IsoRecordsCliOptions {
  tenant?: string;
  iso?: string;
  strict?: boolean;
  json?: boolean;
}

export function runIsoRecordsCheck(options: IsoRecordsCliOptions = {}): void {
  if (options.tenant) setTenantId(options.tenant);

  const standards = options.iso ? [options.iso] : loadEnabledIsoIds();
  const withSpecs = standards.filter((id) => loadRecordSpecs(id) !== undefined);
  const reports = withSpecs.flatMap((id) => checkRecordsForStandard(id));

  if (options.json) {
    console.log(JSON.stringify({ standards: withSpecs, reports }, null, 2));
  } else {
    if (withSpecs.length === 0) {
      console.log(
        standards.length === 0
          ? "有効な ISO 規格がありません。"
          : `${standards.join(", ")} に records.yaml がありません。`,
      );
      return;
    }
    console.log(formatRecordReports(reports));
  }

  const errors = reports.reduce(
    (n, r) => n + r.issues.filter((i) => i.severity === "error").length,
    0,
  );
  if (options.strict && errors > 0) process.exitCode = 1;
}
