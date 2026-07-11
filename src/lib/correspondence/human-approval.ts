import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import {
  assertApproverAuthorized,
  loadAuthorizedApprovers,
  normalizePersonName,
} from "../org/authorized-approvers.js";
import { findOperatorById } from "../org/operators.js";
import { isCorrespondenceApprovalSubject } from "./review.js";
import { CorrespondenceApprovalGateError } from "./send-gate.js";
import { CORRESPONDENCE_CLI } from "./cli-labels.js";

/** Operator IDs that must not grant human approval or send correspondence. */
export const AGENT_OPERATOR_IDS = new Set([
  "secretary",
  "mail_intake",
  "mail_outbound",
  "dev-bypass",
  "operator",
  "mcp_service",
]);

export function isHumanApproverOperatorId(operatorId: string): boolean {
  const id = operatorId.trim();
  if (!id || AGENT_OPERATOR_IDS.has(id)) return false;
  const record = findOperatorById(id);
  if (!record || record.status !== "active") return false;
  return record.role === "ceo" || record.role === "approver";
}

export function assertHumanCorrespondenceApproval(
  approval: OrgApprovalRequest,
  draft?: CorrespondenceDraft
): void {
  if (!isCorrespondenceApprovalSubject(approval.subject_type)) return;

  if (!approval.human_review_confirmed_at) {
    throw new CorrespondenceApprovalGateError(
      `Approval ${approval.approval_id} lacks human review confirmation — ` +
        `CEO must run: org approval approve --id ${approval.approval_id} --approver "<name>" --reviewed ` +
        `after orgos ${CORRESPONDENCE_CLI.show} --id ${approval.subject_ref ?? draft?.draft_id ?? "?"}`
    );
  }

  if (!approval.approver_id?.trim()) {
    throw new CorrespondenceApprovalGateError(
      `Approval ${approval.approval_id} has no approver_id — human CEO/approver name required`
    );
  }

  assertApproverAuthorized(approval.approver_id, "A");

  const approverNorm = normalizePersonName(approval.approver_id);
  const authorized = loadAuthorizedApprovers();
  const ok = authorized.some(
    (a) => a === approverNorm || a.includes(approverNorm) || approverNorm.includes(a)
  );
  if (!ok && authorized.length > 0) {
    throw new CorrespondenceApprovalGateError(
      `Approver "${approval.approver_id}" is not in authorized approvers registry`
    );
  }

  if (approval.approved_by_operator_id) {
    if (!isHumanApproverOperatorId(approval.approved_by_operator_id)) {
      throw new CorrespondenceApprovalGateError(
        `Approval ${approval.approval_id} was recorded by non-human operator ` +
          `"${approval.approved_by_operator_id}" — agents cannot approve correspondence`
      );
    }
  }

  const proposer = approval.proposed_by?.trim().toLowerCase() ?? "";
  if (
    AGENT_OPERATOR_IDS.has(proposer) &&
    approval.approved_by_operator_id &&
    approval.approved_by_operator_id === approval.proposed_by
  ) {
    throw new CorrespondenceApprovalGateError(
      "Agent cannot self-approve correspondence — separate human approver required"
    );
  }
}
