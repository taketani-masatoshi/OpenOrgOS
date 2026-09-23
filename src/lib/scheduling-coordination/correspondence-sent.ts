import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { loadCorrespondenceDraft } from "../correspondence/draft.js";
import { isHumanApproverOperatorId } from "../correspondence/human-approval.js";
import { findOrgApproval } from "../org/approval/index.js";
import { externalTargets } from "./correspondence-drafts.js";
import { proposeSlotsOntoSchedulingCase } from "./propose-case.js";
import { type SchedulingDraftKind } from "./draft-text.js";
import { resolveNextAction } from "./judgment-context.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle-events.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

function allExternalSent(caseRow: SchedulingCase, kind: SchedulingDraftKind): boolean {
  const targetIds = externalTargets(caseRow, kind).map((participant) => participant.id);
  return (
    targetIds.length === 0 ||
    targetIds.every((participantId) =>
      caseRow.correspondence.some(
        (record) =>
          record.kind === kind &&
          record.participant_id === participantId &&
          record.proposal_revision === caseRow.proposal_revision &&
          record.sent_at
      )
    )
  );
}

export function handleSchedulingCorrespondenceSent(
  draft: CorrespondenceDraft
): SchedulingCase | undefined {
  const notes = draft.notes ?? "";
  const caseId = notes.match(/\bscheduling-case:(SCH-\d{4}-\d{3})\b/)?.[1];
  const kind = notes.match(/\bkind:(clarify|proposal|reminder|confirm)\b/)?.[1] as
    | SchedulingDraftKind
    | undefined;
  const participantId = notes.match(/\bparticipant:(PART-\d{3})\b/)?.[1];
  if (!caseId || !kind || !participantId) return undefined;
  let current = findSchedulingCase(caseId);
  if (!current) return undefined;

  const record = current.correspondence.find((item) => item.draft_id === draft.draft_id);
  if (!record) return current;
  if (!record.sent_at) {
    current = updateSchedulingCase(current.id, current.revision, (row) => ({
      ...row,
      correspondence: row.correspondence.map((item) =>
        item.draft_id === draft.draft_id
          ? {
              ...item,
              sent_at: draft.sent_at ?? new Date().toISOString(),
              sent_mail_id: draft.draft_id,
            }
          : item
      ),
      last_sent_mail_id: draft.draft_id,
      updated_at: new Date().toISOString(),
    }));
  }

  if (!allExternalSent(current, kind)) return current;
  if (kind === "clarify") {
    // The venue question has gone out; dates can now be offered.
    return proposeSlotsOntoSchedulingCase(current.id);
  }
  if (kind === "proposal") {
    if (current.status !== "awaiting_responses") {
      current = updateSchedulingCase(current.id, current.revision, (row) =>
        resolveNextAction({
          ...row,
          status: "awaiting_responses",
          reminder_due_at: undefined,
          updated_at: new Date().toISOString(),
        })
      );
    }
    const draftRecord = loadCorrespondenceDraft(draft.draft_id);
    const approval = draftRecord.approval_id
      ? findOrgApproval(draftRecord.approval_id)
      : undefined;
    const operatorId = draft.sent_by?.trim();
    const approverName = approval?.approver_id;
    if (
      operatorId &&
      isHumanApproverOperatorId(operatorId) &&
      approverName
    ) {
      current = updateSchedulingCase(current.id, current.revision, (row) => ({
        ...row,
        proposal_send_authority: {
          operator_id: operatorId,
          approver_name: approverName,
          covers_up_to_revision: row.proposal_revision,
        },
        updated_at: new Date().toISOString(),
      }));
    }
    return recordSchedulingLifecycleEvent(current.id, "proposal_sent", draft.sent_by);
  }
  if (kind === "confirm") {
    current = recordSchedulingLifecycleEvent(current.id, "notification_sent", draft.sent_by);
    if (current.status !== "closed") {
      current = updateSchedulingCase(current.id, current.revision, (row) => ({
        ...row,
        status: "closed",
        next_action: "none",
        ceo_question_id: undefined,
        pending_slot_id: undefined,
        updated_at: new Date().toISOString(),
      }));
    }
    return current;
  }
  if (!current.reminder_targets.includes(participantId)) return current;
  return updateSchedulingCase(current.id, current.revision, (row) =>
    resolveNextAction({
      ...row,
      status: "awaiting_responses",
      reminder_targets: row.reminder_targets.filter((id) => id !== participantId),
      updated_at: new Date().toISOString(),
    })
  );
}

export function reconcileSchedulingCorrespondence(caseId: string): SchedulingCase {
  let current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  for (const record of current.correspondence) {
    try {
      const draft = loadCorrespondenceDraft(record.draft_id);
      if (draft.status !== "sent") continue;
      handleSchedulingCorrespondenceSent(draft);
      current = findSchedulingCase(caseId) ?? current;
    } catch {
      // Missing/corrupt drafts remain visible as incomplete; validation reports the artifact error.
    }
  }
  return current;
}
