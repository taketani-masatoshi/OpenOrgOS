import type { EtaxSubmissionStatus } from "../../../schemas/etax/submission-state.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { FilingException } from "../efiling/errors.js";
import {
  canTransitionFiling,
  invalidateFilingAfterContentChange,
  transitionFilingStatus,
} from "../efiling/state-machine.js";

export function canTransition(
  from: EtaxSubmissionStatus,
  to: EtaxSubmissionStatus,
): boolean {
  return canTransitionFiling(from, to);
}

export function transitionStatus(
  from: EtaxSubmissionStatus,
  to: EtaxSubmissionStatus,
): EtaxSubmissionStatus {
  try {
    return transitionFilingStatus(from, to);
  } catch (error) {
    if (error instanceof FilingException) {
      throw etaxError({
        code: "ETAX_ILLEGAL_STATUS_TRANSITION",
        field: "status",
        rule: `${from}->${to}`,
        message: `Illegal e-Tax submission transition ${from} → ${to}`,
      });
    }
    throw error;
  }
}

/** Content-hash mismatch invalidates approval, signature, and submit readiness. */
export function invalidateAfterContentChange(
  current: EtaxSubmissionStatus,
): EtaxSubmissionStatus {
  try {
    return invalidateFilingAfterContentChange(current);
  } catch (error) {
    if (error instanceof FilingException) {
      throw etaxError({
        code: "ETAX_IMMUTABLE_AFTER_RECEIPT",
        field: "status",
        rule: "content-hash",
        message: `Cannot mutate a ${current} submission; open a new revision`,
      });
    }
    throw error;
  }
}

export function isSubmitReady(status: EtaxSubmissionStatus): boolean {
  return status === "READY_TO_SUBMIT";
}
