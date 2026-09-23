import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { createCorrespondenceDraft } from "../correspondence/draft.js";
import { extractAmounts } from "../correspondence/claims-assert.js";
import type { CorrespondenceClaim } from "../correspondence/facts-verify.js";
import {
  resolveContactRegistry,
  resolveEmailFromContactRef,
} from "../secretary/contact-registry.js";
import { writeSchedulingActionCard } from "./action-card.js";
import { buildSchedulingClarifyText } from "./clarify-text.js";
import { assertMealCostForOutboundDraft } from "./meal-cost.js";
import {
  buildSchedulingDraftText,
  type SchedulingDraftKind,
} from "./draft-text.js";
import { persistSchedulingNextAction } from "./persist-next-action.js";
import { resolveSchedulingRecipients } from "./recipients.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

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

export function externalTargets(caseRow: SchedulingCase, kind: SchedulingDraftKind) {
  const external = caseRow.participants.filter((participant) => participant.role === "external");
  if (kind === "reminder") {
    const eligible = new Set(caseRow.reminder_targets);
    return external.filter(
      (participant) => participant.response === "pending" && eligible.has(participant.id)
    );
  }
  return external;
}

/**
 * The meal cost in the body comes from `cost_estimate`, which only a human can
 * set (`orgos executive scheduling set-cost`). Carry it as a verified claim so
 * the outbound amount gate can see where the figure came from.
 */
function schedulingCostClaimNote(caseRow: SchedulingCase, body: string): string[] {
  const estimate = caseRow.cost_estimate?.trim();
  if (!estimate) return [];
  const amounts = extractAmounts(body);
  if (!amounts.length) return [];
  const claims: CorrespondenceClaim[] = amounts.map((value, index) => ({
    id: `${caseRow.id}-cost-${index + 1}`,
    kind: "amount",
    label: "会食費用の目安",
    value,
    source: `data/executive/scheduling-cases.yaml#${caseRow.id}.cost_estimate`,
    verified: true,
  }));
  return [`claims-json:${JSON.stringify(claims)}`];
}

export function ensureSchedulingCorrespondenceDrafts(
  caseId: string,
  kind: SchedulingDraftKind,
  createdBy = "secretary"
): SchedulingCase {
  let current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  assertMealCostForOutboundDraft(current, kind);
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

    // A clarify asks about the venue before any date exists, so it has its own
    // body: the generic draft text would fail the clarify style lint.
    const { subject, body } =
      kind === "clarify"
        ? buildSchedulingClarifyText(current, target)
        : buildSchedulingDraftText(current, kind, target);
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
        [
          `scheduling-case:${current.id}`,
          `kind:${kind}`,
          `participant:${target.id}`,
          `revision:${current.proposal_revision}`,
        ].join(" "),
        ...schedulingCostClaimNote(current, body),
      ].join("\n"),
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
  return persistSchedulingNextAction(current);
}
