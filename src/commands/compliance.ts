import { formatComplianceGapReport, computeComplianceGap } from "../lib/compliance-gap.js";
import { setTenantId } from "../lib/tenant.js";

export interface ComplianceGapOptions {
  tenant?: string;
  json?: boolean;
}

export function runComplianceGap(opts: ComplianceGapOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);

  if (opts.json) {
    console.log(JSON.stringify(computeComplianceGap(), null, 2));
    return;
  }

  console.log(formatComplianceGapReport());
  const { gaps } = computeComplianceGap();
  if (gaps.length) process.exit(1);
}
