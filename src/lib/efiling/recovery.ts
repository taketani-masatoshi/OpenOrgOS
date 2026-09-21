import type { FilingLookupStatus, FilingStatus } from "../../../schemas/efiling/filing.js";
import { filingError } from "./errors.js";

export type FilingAttempt = {
  requestId: string;
  outcome: "started" | "failed" | "received";
  detail?: string;
};

export type InFlightFiling = {
  status: FilingStatus;
  requestId?: string;
  attempts: FilingAttempt[];
  receiptNumber?: string;
};

export type FilingLookup = {
  status: FilingLookupStatus;
  receiptNumber?: string;
};

/**
 * Recover a send that stopped in SUBMITTED (in flight) or TRANSPORT_ERROR.
 * not_found returns the filing to SIGNED so the same idempotency key can resend.
 * unknown does not advance state. found stores the receipt.
 */
export function recoverInFlightFiling<T extends InFlightFiling>(
  record: T,
  lookup: FilingLookup,
): { record: T; escalate: boolean; resendAllowed: boolean } {
  const inFlight = record.status === "SUBMITTED" || record.status === "TRANSPORT_ERROR";
  if (!inFlight) return { record, escalate: false, resendAllowed: false };
  const started = [...record.attempts].reverse().find((row) => row.outcome === "started");
  if (!started && record.status === "TRANSPORT_ERROR") {
    return { record, escalate: false, resendAllowed: true };
  }
  if (lookup.status === "unknown") {
    return { record, escalate: true, resendAllowed: false };
  }
  if (lookup.status === "not_found") {
    const attempts = record.attempts.map((row) =>
      row === started ? { ...row, outcome: "failed" as const, detail: "receipt lookup confirmed not found" } : row,
    );
    return {
      record: {
        ...record,
        status: "SIGNED",
        requestId: undefined,
        attempts,
      },
      escalate: false,
      resendAllowed: true,
    };
  }
  if (!lookup.receiptNumber) {
    throw filingError("EFILING_RECOVERY_RECEIPT_MISSING", "found lookup did not include a receipt number");
  }
  const attempts = record.attempts.map((row) =>
    row === started ? { ...row, outcome: "received" as const } : row,
  );
  return {
    record: {
      ...record,
      status: "RECEIVED_BY_ETAX",
      receiptNumber: lookup.receiptNumber,
      attempts,
    },
    escalate: false,
    resendAllowed: false,
  };
}
