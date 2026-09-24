import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { humanApproveOrgApproval } from "../org/approval/index.js";
import { loadCorrespondenceDraft } from "../correspondence/draft.js";
import { sendApprovedCorrespondence } from "../correspondence/send-gate.js";
import {
  assertDelegatableProposalSend,
  getDelegatableProposalSendAuthority,
  invalidateStaleProposalSendAuthority,
} from "./proposal-send-authority.js";
import { persistSchedulingNextAction } from "./persist-next-action.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";
import { SchedulingCaseNotFoundError } from "./errors.js";

export async function sendSchedulingConfirmationsAuthorizedByCeo(
  caseId: string,
  opts: { approverName: string; operatorId: string; dryRun?: boolean }
): Promise<SchedulingCase> {
  let current = findSchedulingCase(caseId);
  if (!current) throw new SchedulingCaseNotFoundError(caseId);

  const pendingConfirmRecords = current.correspondence.filter(
    (record) => record.kind === "confirm" && !record.sent_at
  );
  if (!pendingConfirmRecords.length) return persistSchedulingNextAction(current);

  const approvalIds = new Set<string>();
  for (const record of pendingConfirmRecords) {
    const draft = loadCorrespondenceDraft(record.draft_id);
    if (draft.approval_id) approvalIds.add(draft.approval_id);
  }

  for (const approvalId of approvalIds) {
    humanApproveOrgApproval({
      approvalId,
      approverId: opts.approverName,
      operatorId: opts.operatorId,
      source: "chat_ui",
      humanReviewConfirmed: true,
    });
  }

  for (const record of pendingConfirmRecords) {
    await sendApprovedCorrespondence({
      draftId: record.draft_id,
      operatorId: opts.operatorId,
      dryRun: opts.dryRun,
    });
    current = findSchedulingCase(caseId) ?? current;
  }

  return persistSchedulingNextAction(current);
}

export async function sendSchedulingProposalsUnderStoredAuthority(
  caseId: string,
  opts?: { dryRun?: boolean }
): Promise<SchedulingCase> {
  let current = findSchedulingCase(caseId);
  if (!current) throw new SchedulingCaseNotFoundError(caseId);
  current = assertDelegatableProposalSend(current);
  const authority = getDelegatableProposalSendAuthority(caseId);
  if (!authority) {
    return invalidateStaleProposalSendAuthority(current);
  }

  const pendingProposalRecords = current.correspondence.filter(
    (record) =>
      record.kind === "proposal" &&
      !record.sent_at &&
      record.proposal_revision === current!.proposal_revision &&
      record.proposal_revision > authority.covers_up_to_revision
  );
  if (!pendingProposalRecords.length) return current;

  const approvalIds = new Set<string>();
  for (const record of pendingProposalRecords) {
    const draft = loadCorrespondenceDraft(record.draft_id);
    if (draft.approval_id) approvalIds.add(draft.approval_id);
  }

  for (const approvalId of approvalIds) {
    humanApproveOrgApproval({
      approvalId,
      approverId: authority.approver_name,
      operatorId: authority.operator_id,
      source: "chat_ui",
      humanReviewConfirmed: true,
    });
  }

  for (const record of pendingProposalRecords) {
    await sendApprovedCorrespondence({
      draftId: record.draft_id,
      operatorId: authority.operator_id,
      dryRun: opts?.dryRun,
    });
    current = findSchedulingCase(caseId) ?? current;
  }

  current = updateSchedulingCase(current.id, current.revision, (row) => ({
    ...row,
    proposal_send_authority: {
      ...authority,
      covers_up_to_revision: row.proposal_revision,
    },
    updated_at: new Date().toISOString(),
  }));

  return persistSchedulingNextAction(current);
}

export async function maybeAutoSendAuthorizedProposals(
  caseId: string
): Promise<SchedulingCase | undefined> {
  let current = findSchedulingCase(caseId);
  if (!current?.proposal_send_authority) return current;
  current = assertDelegatableProposalSend(current);
  const authority = current.proposal_send_authority;
  if (!authority) return current;
  if (current.proposal_revision <= authority.covers_up_to_revision) {
    return current;
  }
  const hasPending = current.correspondence.some(
    (record) =>
      record.kind === "proposal" &&
      !record.sent_at &&
      record.proposal_revision === current.proposal_revision
  );
  if (!hasPending) return current;
  return sendSchedulingProposalsUnderStoredAuthority(caseId);
}
