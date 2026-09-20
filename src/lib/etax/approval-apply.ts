/**
 * Apply org approval for e-Tax ReturnPackage submissions (ADR 0038 + ADR 0078).
 * Final approve remains human-only via org approval / etax approve.
 */
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import { ETAX_APPROVAL_SUBJECT, parseContentHashMessage } from "./approval.js";
import { applyHashBoundApproval } from "./lifecycle.js";
import { requireReturnPackage, requireSubmission } from "./store.js";
import { etaxError } from "../../../schemas/etax/errors.js";

export function isEtaxApprovalSubject(subjectType: string): boolean {
  return subjectType === ETAX_APPROVAL_SUBJECT;
}

/**
 * Called from humanApproveOrgApproval after the org approval is marked approved.
 * Throws → caller rolls the org approval back to pending (medical-device pattern).
 */
export function applyEtaxApproval(approval: OrgApprovalRequest): void {
  if (!isEtaxApprovalSubject(approval.subject_type)) {
    throw etaxError({
      code: "ETAX_ORG_APPROVAL_SUBJECT",
      message: `Not an e-Tax approval subject: ${approval.subject_type}`,
    });
  }
  const submissionId = approval.subject_ref;
  if (!submissionId) {
    throw etaxError({
      code: "ETAX_ORG_APPROVAL_NO_SUBJECT_REF",
      message: "e-Tax org approval requires subject_ref = submission id",
    });
  }
  const sub = requireSubmission(submissionId);
  const pkg = requireReturnPackage(sub.packageId);
  const bound = parseContentHashMessage(approval.message);
  if (bound !== pkg.contentHash) {
    throw etaxError({
      code: "ETAX_APPROVAL_HASH_MISMATCH",
      blocked: "HASH_MISMATCH",
      message: "Org approval contentHash does not match the live ReturnPackage",
    });
  }
  applyHashBoundApproval({
    submissionId: sub.id,
    approvalId: approval.approval_id,
    actor: approval.approver_id ?? approval.proposed_by,
  });
}
