import { setTenantId } from "../lib/tenant.js";
import {
  formatClauseVerification,
  summarizeClauseVerification,
} from "../lib/iso-clause-verification.js";

export interface IsoClausesCliOptions {
  tenant?: string;
  iso?: string;
  json?: boolean;
}

export function runIsoClauses(options: IsoClausesCliOptions = {}): void {
  if (options.tenant) setTenantId(options.tenant);
  const summary = summarizeClauseVerification(options.iso ? [options.iso] : undefined);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(formatClauseVerification(summary));
}
