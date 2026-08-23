import {
  auditCliMutation,
  requireCliHumanApproval,
} from "../console-auth/cli-operator.js";
import { loadCorrespondenceDraft, markCorrespondenceDraftApproved } from "../correspondence/draft.js";
import { sendApprovedCorrespondence } from "../correspondence/send-gate.js";
import { assertCorrespondenceReviewAcknowledged } from "../correspondence/review.js";
import { humanApproveOrgApproval } from "../org/approval/approve.js";
import { findOrgApproval } from "../org/approval/index.js";
import { findSchedulingCase } from "./store.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";

export interface ApproveSendSchedulingProposalsOptions {
  caseId: string;
  operatorId: string;
  dryRun?: boolean;
  reviewed?: boolean;
  command?: string;
}

function listPendingProposalDraftIds(caseRow: SchedulingCase): string[] {
  return caseRow.correspondence
    .filter((record) => record.kind === "proposal" && !record.sent_at)
    .map((record) => record.draft_id);
}

/** Approve and send all unsent proposal drafts for a scheduling case (human gate). */
export async function approveAndSendSchedulingProposals(
  opts: ApproveSendSchedulingProposalsOptions
): Promise<string[]> {
  const caseRow = findSchedulingCase(opts.caseId);
  if (!caseRow) throw new Error(`Scheduling case ${opts.caseId} not found`);

  const draftIds = listPendingProposalDraftIds(caseRow);
  if (!draftIds.length) {
    throw new Error(`No unsent proposal drafts for ${opts.caseId}`);
  }

  const auth = requireCliHumanApproval(opts.command ?? "executive scheduling approve-send");
  const approverName = auth.record.approver_name ?? auth.record.display_name;
  const sent: string[] = [];

  for (const draftId of draftIds) {
    const draft = loadCorrespondenceDraft(draftId);
    if (!draft.approval_id) throw new Error(`Draft ${draft.draft_id} has no approval_id`);
    const pending = findOrgApproval(draft.approval_id);
    if (!pending) throw new Error(`Approval ${draft.approval_id} not found`);

    assertCorrespondenceReviewAcknowledged({ approval: pending, reviewed: opts.reviewed !== false });
    humanApproveOrgApproval({
      approvalId: draft.approval_id,
      approverId: approverName,
      operatorId: opts.operatorId,
      source: "cli",
      humanReviewConfirmed: true,
    });
    markCorrespondenceDraftApproved(draft.draft_id);
    await sendApprovedCorrespondence({
      draftId: draft.draft_id,
      operatorId: opts.operatorId,
      dryRun: opts.dryRun !== false,
    });
    sent.push(draft.draft_id);
    auditCliMutation(opts.command ?? "executive scheduling approve-send", draft.draft_id);
  }

  return sent;
}
