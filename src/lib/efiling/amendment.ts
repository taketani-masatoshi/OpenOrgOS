import type { FilingKind } from "../../../schemas/efiling/filing.js";
import { filingError } from "./errors.js";

export function assertFilingKind(input: {
  filingKind: FilingKind;
  priorReceiptNumber?: string;
}): void {
  const prior = input.priorReceiptNumber?.trim() ?? "";
  if (input.filingKind === "original" && prior.length > 0) {
    throw filingError(
      "EFILING_ORIGINAL_FORBIDS_PRIOR_RECEIPT",
      "original filings must not carry a prior receipt number"
    );
  }
  if ((input.filingKind === "amended" || input.filingKind === "corrected") && prior.length === 0) {
    throw filingError(
      "EFILING_AMENDMENT_REQUIRES_PRIOR_RECEIPT",
      `${input.filingKind} filings require the original receipt number`
    );
  }
}

export function assertAuditBindsPriorReceipt(input: {
  filingKind: FilingKind;
  priorReceiptNumber?: string;
  auditRows: Array<{ priorReceiptNumber?: string }>;
}): void {
  if (input.filingKind === "original") return;
  const prior = input.priorReceiptNumber;
  for (const row of input.auditRows) {
    if (row.priorReceiptNumber !== prior) {
      throw filingError(
        "EFILING_AUDIT_PRIOR_MISMATCH",
        "audit rows must bind the same prior receipt number as the amended filing"
      );
    }
  }
}
