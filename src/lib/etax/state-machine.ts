import type { EtaxSubmissionStatus } from "../../../schemas/etax/submission-state.js";
import { etaxError } from "../../../schemas/etax/errors.js";

const ALLOWED: Record<EtaxSubmissionStatus, readonly EtaxSubmissionStatus[]> = {
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

export function canTransition(
  from: EtaxSubmissionStatus,
  to: EtaxSubmissionStatus,
): boolean {
  return ALLOWED[from].includes(to);
}

export function transitionStatus(
  from: EtaxSubmissionStatus,
  to: EtaxSubmissionStatus,
): EtaxSubmissionStatus {
  if (from === to) return from;
  if (!canTransition(from, to)) {
    throw etaxError({
      code: "ETAX_ILLEGAL_STATUS_TRANSITION",
      field: "status",
      rule: `${from}->${to}`,
      message: `Illegal e-Tax submission transition ${from} → ${to}`,
    });
  }
  return to;
}

/** Content-hash mismatch invalidates approval, signature, and submit readiness. */
export function invalidateAfterContentChange(
  current: EtaxSubmissionStatus,
): EtaxSubmissionStatus {
  if (current === "DRAFT") return "DRAFT";
  if (current === "RECEIVED_BY_ETAX" || current === "REJECTED_BY_ETAX") {
    throw etaxError({
      code: "ETAX_IMMUTABLE_AFTER_RECEIPT",
      field: "status",
      rule: "content-hash",
      message: `Cannot mutate a ${current} submission; open a new revision`,
    });
  }
  return "DRAFT";
}

export function isSubmitReady(status: EtaxSubmissionStatus): boolean {
  return status === "READY_TO_SUBMIT";
}
