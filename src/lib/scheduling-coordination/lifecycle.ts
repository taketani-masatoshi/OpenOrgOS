import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { appendAuditEvent } from "../audit-log.js";
import {
  createCompanyEvent,
  listCompanyEvents,
} from "../company-events.js";
import {
  createCorrespondenceDraft,
  loadCorrespondenceDraft,
} from "../correspondence/draft.js";
import { isHumanApproverOperatorId } from "../correspondence/human-approval.js";
import {
  assertDelegatableProposalSend,
  getDelegatableProposalSendAuthority,
  invalidateStaleProposalSendAuthority,
} from "./proposal-send-authority.js";
import { findOrgApproval } from "../org/approval/index.js";
import {
  resolveContactRegistry,
  resolveEmailFromContactRef,
} from "../secretary/contact-registry.js";
import { currentDate } from "../utils.js";
import { writeSchedulingActionCard } from "./action-card.js";
import {
  buildSchedulingDraftText,
  type SchedulingDraftKind,
} from "./draft-text.js";
import { applyNextAction } from "./next-action.js";
import { resolveSchedulingRecipients } from "./recipients.js";
import {
  findSchedulingCase,
  updateSchedulingCase,
} from "./store.js";

export type SchedulingLifecycleStage =
  | "created"
  | "proposal_sent"
  | "confirmed"
  | "notification_sent"
  | "cancelled"
  | "rescheduled";

function contactRefId(contactRef: string): { extId?: string; stakeholderId?: string } {
  const extId = contactRef.match(/\bEXT-\d+\b/i)?.[0]?.toUpperCase();
  const stakeholderId = contactRef.match(/\bSTK-\d+\b/i)?.[0]?.toUpperCase();
  return { extId, stakeholderId };
}

export function resolveSchedulingParticipantContact(
  participant: SchedulingParticipant
): SchedulingParticipant {
  if (!participant.contact_ref) return participant;
  const ids = contactRefId(participant.contact_ref);
  const direct = ids.extId ? resolveEmailFromContactRef(ids.extId) : undefined;
  const lookup = ids.extId
    ? resolveContactRegistry({ extId: ids.extId })
    : ids.stakeholderId
      ? resolveContactRegistry({ stakeholderId: ids.stakeholderId })
      : undefined;
  const match = lookup?.matches.length === 1 ? lookup.matches[0] : undefined;
  const email = direct ?? match?.email;
  return {
    ...participant,
    email,
    contact_ref: match ? `${match.source}#${match.ref}` : participant.contact_ref,
  };
}

export function resolveSchedulingCaseContacts(caseRow: SchedulingCase): SchedulingCase {
  return {
    ...caseRow,
    participants: caseRow.participants.map(resolveSchedulingParticipantContact),
  };
}

function externalTargets(caseRow: SchedulingCase, kind: SchedulingDraftKind) {
  const external = caseRow.participants.filter((participant) => participant.role === "external");
  if (kind === "reminder") {
    const eligible = new Set(caseRow.reminder_targets);
    return external.filter(
      (participant) => participant.response === "pending" && eligible.has(participant.id)
    );
  }
  return external;
}

function stageTitle(caseRow: SchedulingCase, stage: SchedulingLifecycleStage): string {
  const labels: Record<SchedulingLifecycleStage, string> = {
    created: "日程調整起票",
    proposal_sent: "日程候補送信完了",
    confirmed: "日程確定",
    notification_sent: "日程確定通知送信完了",
    cancelled: "日程調整中止",
    rescheduled: "日程再調整開始",
  };
  return `${labels[stage]} — ${caseRow.title}`;
}

export function recordSchedulingLifecycleEvent(
  caseId: string,
  stage: SchedulingLifecycleStage,
  actor = "secretary"
): SchedulingCase {
  let current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const stageRevision =
    stage === "created" || stage === "cancelled" ? 0 : current.proposal_revision;
  if (
    current.lifecycle_events.some(
      (record) =>
        record.stage === stage && record.proposal_revision === stageRevision
    )
  ) {
    return current;
  }

  const existing = listCompanyEvents({ includeVoided: true }).find(
    (event) =>
      event.related?.meeting_ref === current!.id &&
      event.notes?.includes(`scheduling-stage:${stage}`) &&
      event.notes?.includes(`proposal-revision:${stageRevision}`)
  );
  const event =
    existing ??
    createCompanyEvent({
      kind: "meeting",
      title: stageTitle(current, stage),
      occurredAt: currentDate(),
      slug: `schedule-${current.id.toLowerCase()}-${stage.replaceAll("_", "-")}-r${stageRevision}`,
      related: { meeting_ref: current.id },
      notes: `scheduling-stage:${stage}; proposal-revision:${stageRevision}; actor:${actor}`,
    });
  appendAuditEvent({
    event: "handoff",
    ref: current.id,
    actor,
    detail: `scheduling lifecycle ${stage}`,
    transaction_id: event.id,
  });
  current = updateSchedulingCase(current.id, current.revision, (row) => ({
    ...row,
    lifecycle_events: [
      ...row.lifecycle_events,
      {
        stage,
        proposal_revision: stageRevision,
        event_id: event.id,
        recorded_at: new Date().toISOString(),
      },
    ],
    updated_at: new Date().toISOString(),
  }));
  return current;
}

export function ensureSchedulingCorrespondenceDrafts(
  caseId: string,
  kind: SchedulingDraftKind,
  createdBy = "secretary"
): SchedulingCase {
  let current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const resolved = resolveSchedulingCaseContacts(current);
  const targets = externalTargets(resolved, kind);
  const unresolved = targets.filter((participant) => !participant.email);
  if (unresolved.length) {
    return updateSchedulingCase(current.id, current.revision, (row) => ({
      ...row,
      participants: resolved.participants,
      status: "needs_review",
      next_action: "none",
      exception_reason: `schedule_contact_unresolved:${unresolved.map((p) => p.id).join(",")}`,
      updated_at: new Date().toISOString(),
    }));
  }

  if (
    resolved.participants.some(
      (participant, index) => participant !== current!.participants[index]
    ) ||
    current.exception_reason?.startsWith("schedule_contact_unresolved:")
  ) {
    current = updateSchedulingCase(current.id, current.revision, (row) => ({
      ...row,
      participants: resolved.participants,
      status: row.exception_reason?.startsWith("schedule_contact_unresolved:")
        ? kind === "confirm"
          ? "confirmed"
          : kind === "reminder"
            ? "awaiting_responses"
            : "proposing"
        : row.status,
      exception_reason: row.exception_reason?.startsWith("schedule_contact_unresolved:")
        ? undefined
        : row.exception_reason,
      updated_at: new Date().toISOString(),
    }));
  }

  for (const target of targets) {
    current = findSchedulingCase(caseId)!;
    const exists = current.correspondence.some(
      (record) =>
        record.kind === kind &&
        record.participant_id === target.id &&
        record.proposal_revision === current!.proposal_revision
    );
    if (exists) continue;

    const { subject, body } = buildSchedulingDraftText(current, kind, target);
    const recipients = resolveSchedulingRecipients(current, kind, target.id);
    if (!recipients.to) {
      throw new Error(`Scheduling participant ${target.id} has no resolved recipient`);
    }
    const { draft, approvalId } = createCorrespondenceDraft({
      channel: "email",
      body,
      subject,
      to: recipients.to,
      cc: recipients.cc,
      contactRef: target.contact_ref,
      createdBy,
      notes: [
        `scheduling-case:${current.id}`,
        `kind:${kind}`,
        `participant:${target.id}`,
        `revision:${current.proposal_revision}`,
      ].join(" "),
      proposeApproval: true,
    });
    writeSchedulingActionCard({ caseRow: current, draft, kind, approvalId });
    current = updateSchedulingCase(current.id, current.revision, (row) => ({
      ...row,
      status: kind === "confirm" ? "notifying" : row.status,
      reminder_history:
        kind === "reminder"
          ? [
              ...row.reminder_history,
              {
                proposal_revision: row.proposal_revision,
                participant_id: target.id,
                drafted_at: new Date().toISOString(),
                draft_id: draft.draft_id,
              },
            ]
          : row.reminder_history,
      reminder_targets:
        kind === "reminder"
          ? row.reminder_targets.filter((id) => id !== target.id)
          : row.reminder_targets,
      correspondence: [
        ...row.correspondence,
        {
          kind,
          participant_id: target.id,
          proposal_revision: row.proposal_revision,
          draft_id: draft.draft_id,
          drafted_at: new Date().toISOString(),
        },
      ],
      last_draft_id: draft.draft_id,
      updated_at: new Date().toISOString(),
    }));
  }
  return applyPersistedNextAction(current);
}

function applyPersistedNextAction(caseRow: SchedulingCase): SchedulingCase {
  const desired = applyNextAction(caseRow);
  if (
    desired.status === caseRow.status &&
    desired.next_action === caseRow.next_action &&
    desired.exception_reason === caseRow.exception_reason
  ) {
    return caseRow;
  }
  return updateSchedulingCase(caseRow.id, caseRow.revision, () => desired);
}

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
  const kind = notes.match(/\bkind:(proposal|reminder|confirm)\b/)?.[1] as
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
  if (kind === "proposal") {
    if (current.status !== "awaiting_responses") {
      current = updateSchedulingCase(current.id, current.revision, (row) =>
        applyNextAction({
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
    applyNextAction({
      ...row,
      status: "awaiting_responses",
      reminder_targets: row.reminder_targets.filter((id) => id !== participantId),
      updated_at: new Date().toISOString(),
    })
  );
}

export async function sendSchedulingConfirmationsAuthorizedByCeo(
  caseId: string,
  opts: { approverName: string; operatorId: string; dryRun?: boolean }
): Promise<SchedulingCase> {
  let current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);

  const pendingConfirmRecords = current.correspondence.filter(
    (record) => record.kind === "confirm" && !record.sent_at
  );
  if (!pendingConfirmRecords.length) return applyPersistedNextAction(current);

  const { approveOrgApproval } = await import("../org/approval/index.js");
  const { sendApprovedCorrespondence } = await import("../correspondence/send-gate.js");

  const approvalIds = new Set<string>();
  for (const record of pendingConfirmRecords) {
    const draft = loadCorrespondenceDraft(record.draft_id);
    if (draft.approval_id) approvalIds.add(draft.approval_id);
  }

  for (const approvalId of approvalIds) {
    approveOrgApproval({
      approvalId,
      approverId: opts.approverName,
      operatorId: opts.operatorId,
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

  return applyPersistedNextAction(current);
}

export async function sendSchedulingProposalsUnderStoredAuthority(
  caseId: string,
  opts?: { dryRun?: boolean }
): Promise<SchedulingCase> {
  let current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
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

  const { approveOrgApproval } = await import("../org/approval/index.js");
  const { sendApprovedCorrespondence } = await import("../correspondence/send-gate.js");

  const approvalIds = new Set<string>();
  for (const record of pendingProposalRecords) {
    const draft = loadCorrespondenceDraft(record.draft_id);
    if (draft.approval_id) approvalIds.add(draft.approval_id);
  }

  for (const approvalId of approvalIds) {
    approveOrgApproval({
      approvalId,
      approverId: authority.approver_name,
      operatorId: authority.operator_id,
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

  return applyPersistedNextAction(current);
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
