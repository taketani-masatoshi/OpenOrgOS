import { etaxError } from "../../../schemas/etax/errors.js";
import { transitionStatus } from "./state-machine.js";
import type { EtaxSubmissionRecord } from "./store.js";

export const ETAX_APPROVAL_SUBJECT = "etax.return_package";

export function contentHashMessage(contentHash: string): string {
  return `etax-content-hash:${contentHash}`;
}

export function parseContentHashMessage(message: string | undefined): string | undefined {
  const match = message?.match(/^etax-content-hash:(sha256:[a-f0-9]{64})$/);
  return match?.[1];
}

export function bindApprovalToSubmission(
  sub: EtaxSubmissionRecord,
  opts: { approvalId: string; contentHash: string },
): EtaxSubmissionRecord {
  if (sub.status !== "BUSINESS_RULE_VALID") {
    throw etaxError({
      code: "ETAX_APPROVE_REQUIRES_BUSINESS_RULE_VALID",
      field: "status",
      rule: `${sub.status}->APPROVED`,
      message: `Approval requires BUSINESS_RULE_VALID. Current status is ${sub.status}`,
    });
  }
  if (sub.contentHash !== opts.contentHash) {
    throw etaxError({
      code: "ETAX_APPROVAL_HASH_MISMATCH",
      field: "approvalContentHash",
      blocked: "HASH_MISMATCH",
      message: "Approval contentHash does not match the live submission",
    });
  }
  return {
    ...sub,
    status: transitionStatus(sub.status, "APPROVED"),
    approvalId: opts.approvalId,
    approvalContentHash: opts.contentHash,
  };
}
