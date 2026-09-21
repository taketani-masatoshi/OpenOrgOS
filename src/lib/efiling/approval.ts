import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import type { HumanApprovalContext } from "../../../schemas/org/human-approval-context.js";
import { operatorHasPermission } from "../console-auth/operator-rbac.js";
import { assertHumanApprovalContext } from "../org/human-approval-context.js";
import { findOperatorById } from "../org/operators.js";
import { filingError } from "./errors.js";

export const EFILING_APPROVAL_SUBJECT = "efiling.submission";

export function assertFilingHumanApproval(input: {
  operatorId: string;
  approval: OrgApprovalRequest;
  context: HumanApprovalContext;
  packageSha256: string;
}): void {
  if (input.approval.subject_type !== EFILING_APPROVAL_SUBJECT) {
    throw filingError("EFILING_APPROVAL_SUBJECT", "approval subject_type must be efiling.submission");
  }
  if (input.approval.subject_ref !== input.packageSha256) {
    throw filingError(
      "EFILING_APPROVAL_SUBJECT_REF",
      "approval subject_ref must equal the package SHA-256",
    );
  }
  const operator = findOperatorById(input.operatorId);
  if (!operator || !operatorHasPermission(operator, "chat:approve")) {
    throw filingError("EFILING_APPROVAL_PERMISSION", "operator lacks chat:approve");
  }
  assertHumanApprovalContext({
    context: input.context,
    approval: input.approval,
    operatorId: input.operatorId,
  });
}
