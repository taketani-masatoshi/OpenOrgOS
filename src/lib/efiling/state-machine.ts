import type { FilingStatus } from "../../../schemas/efiling/filing.js";
import { filingError } from "./errors.js";

const ALLOWED: Record<FilingStatus, readonly FilingStatus[]> = {
  DRAFT: ["GENERATED"],
  GENERATED: ["SCHEMA_VALID", "DRAFT"],
  SCHEMA_VALID: ["BUSINESS_RULE_VALID", "DRAFT"],
  BUSINESS_RULE_VALID: ["APPROVED", "DRAFT"],
  APPROVED: ["SIGNED", "DRAFT"],
  SIGNED: ["READY_TO_SUBMIT", "DRAFT"],
  READY_TO_SUBMIT: ["SUBMITTED", "TRANSPORT_ERROR", "DRAFT"],
  SUBMITTED: ["RECEIVED_BY_ETAX", "REJECTED_BY_ETAX", "TRANSPORT_ERROR"],
  TRANSPORT_ERROR: ["SUBMITTED", "REJECTED_BY_ETAX", "DRAFT"],
  RECEIVED_BY_ETAX: [],
  REJECTED_BY_ETAX: ["DRAFT"],
};

export function canTransitionFiling(from: FilingStatus, to: FilingStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function transitionFilingStatus(from: FilingStatus, to: FilingStatus): FilingStatus {
  if (from === to) return from;
  if (!canTransitionFiling(from, to)) {
    throw filingError(
      "EFILING_ILLEGAL_STATUS_TRANSITION",
      `Illegal filing transition ${from} → ${to}`
    );
  }
  return to;
}

export function invalidateFilingAfterContentChange(current: FilingStatus): FilingStatus {
  if (current === "DRAFT") return "DRAFT";
  if (current === "RECEIVED_BY_ETAX" || current === "REJECTED_BY_ETAX") {
    throw filingError(
      "EFILING_IMMUTABLE_AFTER_RECEIPT",
      `Cannot mutate a ${current} filing; open a new revision`
    );
  }
  return "DRAFT";
}
