import { DEFAULT_RETENTION_YEARS } from "../../../schemas/efiling/filing.js";
import { filingError } from "./errors.js";

export function retentionUntilDate(createdAtIso: string, years = DEFAULT_RETENTION_YEARS): string {
  const created = new Date(createdAtIso);
  if (Number.isNaN(created.getTime())) {
    throw filingError("EFILING_RETENTION_DATE", "createdAt is not a valid timestamp");
  }
  const until = new Date(created.getTime());
  until.setUTCFullYear(until.getUTCFullYear() + years);
  return until.toISOString().slice(0, 10);
}

export function assertRetentionChange(input: {
  legalHold: boolean;
  currentUntil: string;
  nextUntil?: string;
  releaseHold?: boolean;
}): void {
  if (input.legalHold && input.releaseHold) {
    throw filingError("EFILING_LEGAL_HOLD", "legal_hold cannot be released");
  }
  if (input.nextUntil && input.nextUntil < input.currentUntil) {
    throw filingError("EFILING_RETENTION_SHORTEN", "retention_until cannot be shortened");
  }
}
