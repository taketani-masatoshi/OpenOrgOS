import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { currentDate } from "../utils.js";
import { ensureSchedulingCorrespondenceDrafts } from "./correspondence-drafts.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle-events.js";
import { applyNextAction } from "./next-action.js";
import { proposeExecutiveSlots } from "./slots.js";
import {
  findSchedulingCase,
  insertSchedulingCase,
  loadSchedulingCases,
  nextParticipantId,
  nextSchedulingCaseId,
  updateSchedulingCase,
} from "./store.js";
import { advanceSchedulingWorkflow } from "./workflow.js";

export interface SchedulingParticipantInput {
  name: string;
  email?: string;
  role?: "internal" | "external";
  contactRef?: string;
}

export function parseSchedulingParticipantArg(raw: string): SchedulingParticipantInput {
  const parts = raw.split("|").map((part) => part.trim());
  return {
    name: parts[0] ?? raw,
    email: parts[1] || undefined,
    role: (parts[2] as "internal" | "external") || "external",
    contactRef: parts[3] || undefined,
  };
}

export function buildSchedulingParticipants(
  inputs: SchedulingParticipantInput[]
): SchedulingParticipant[] {
  const participants: SchedulingParticipant[] = [];
  for (const input of inputs) {
    participants.push({
      id: nextParticipantId(participants),
      name: input.name,
      email: input.email,
      contact_ref: input.contactRef,
      role: input.role ?? "external",
      response: "pending",
    });
  }
  return participants;
}

export function openSchedulingCase(opts: {
  title: string;
  participants: SchedulingParticipantInput[];
  durationMinutes?: number;
  searchFrom?: string;
  searchTo?: string;
  meetingFormat?: "online" | "in_person" | "unspecified";
  location?: string;
  actor?: string;
}): SchedulingCase {
  const file = loadSchedulingCases();
  const now = new Date().toISOString();
  const caseRow = applyNextAction({
    id: nextSchedulingCaseId(file.cases),
    title: opts.title,
    status: "open",
    created_at: now,
    updated_at: now,
    participants: buildSchedulingParticipants(opts.participants),
    proposed_slots: [],
    duration_minutes: opts.durationMinutes ?? 60,
    search_from: opts.searchFrom,
    search_to: opts.searchTo,
    meeting_format: opts.meetingFormat,
    location: opts.location,
    mail_thread_ids: [],
    next_action: "propose_slots",
  });
  insertSchedulingCase(caseRow);
  recordSchedulingLifecycleEvent(caseRow.id, "created", opts.actor ?? "cli");
  return caseRow;
}

export function proposeSchedulingCaseSlots(opts: {
  id: string;
  from?: string;
  to?: string;
  count?: number;
}): SchedulingCase {
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) throw new Error(`Case ${opts.id} not found`);

  const slots = proposeExecutiveSlots({
    from: opts.from ?? caseRow.search_from ?? currentDate(),
    to: opts.to ?? caseRow.search_to,
    count: opts.count ?? 3,
    durationMinutes: caseRow.duration_minutes,
    existingSlots: caseRow.proposed_slots,
  });

  let updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      proposed_slots: slots,
      status: slots.length ? "proposing" : caseRow.status,
      updated_at: new Date().toISOString(),
    })
  );
  if (updated.next_action === "send_proposal") {
    updated = ensureSchedulingCorrespondenceDrafts(updated.id, "proposal");
  }
  if (updated.next_action === "ceo_confirm") {
    updated = advanceSchedulingWorkflow(updated.id);
  }
  return updated;
}

export function recordSchedulingParticipantResponse(opts: {
  id: string;
  email?: string;
  participantId?: string;
  response: "accept" | "decline" | "counter" | "pending" | "unknown";
  slotId?: string;
  mailId?: string;
  note?: string;
}): SchedulingCase {
  const caseRow = findSchedulingCase(opts.id);
  if (!caseRow) throw new Error(`Case ${opts.id} not found`);

  const participants = caseRow.participants.map((participant) => {
    const matchEmail = opts.email && participant.email?.toLowerCase() === opts.email.toLowerCase();
    const matchId = opts.participantId && participant.id === opts.participantId;
    if (!matchEmail && !matchId) return participant;
    return {
      ...participant,
      response: opts.response,
      accepted_slot_id: opts.slotId ?? participant.accepted_slot_id,
      response_note: opts.note ?? participant.response_note,
      responded_at: new Date().toISOString(),
      responded_mail_id: opts.mailId ?? participant.responded_mail_id,
    };
  });

  let status = caseRow.status;
  if (status === "open" || status === "proposing") status = "awaiting_responses";

  let updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      participants,
      status,
      updated_at: new Date().toISOString(),
    })
  );
  if (updated.next_action === "ceo_confirm") {
    updated = advanceSchedulingWorkflow(updated.id);
  }
  return updated;
}

export function assertSchedulingCaseConfirmable(caseRow: SchedulingCase, slotId: string): void {
  if (!caseRow.proposed_slots.some((slot) => slot.id === slotId)) {
    throw new Error(`Slot ${slotId} does not belong to case ${caseRow.id}`);
  }
  const unanswered = caseRow.participants.filter((participant) => participant.response === "pending");
  if (unanswered.length > 0) {
    throw new Error(
      `Cannot confirm ${caseRow.id}: ${unanswered.length} participant(s) have not answered`
    );
  }
}

export function markSchedulingCaseSlotConfirmed(id: string, slotId: string): SchedulingCase {
  const caseRow = findSchedulingCase(id);
  if (!caseRow) throw new Error(`Case ${id} not found`);
  return updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      status: "confirmed",
      pending_slot_id: slotId,
      updated_at: new Date().toISOString(),
    })
  );
}

export function closeSchedulingCase(id: string): SchedulingCase {
  const caseRow = findSchedulingCase(id);
  if (!caseRow) throw new Error(`Case ${id} not found`);
  return updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      status: "closed",
      next_action: "none",
      updated_at: new Date().toISOString(),
    })
  );
}

export function cancelSchedulingCase(id: string, reason?: string): SchedulingCase {
  const caseRow = findSchedulingCase(id);
  if (!caseRow) throw new Error(`Case ${id} not found`);
  updateSchedulingCase(caseRow.id, caseRow.revision, () => ({
    ...caseRow,
    status: "cancelled",
    next_action: "none",
    exception_reason: reason,
    updated_at: new Date().toISOString(),
  }));
  return recordSchedulingLifecycleEvent(caseRow.id, "cancelled", "cli");
}

export function rescheduleSchedulingCase(id: string): SchedulingCase {
  const caseRow = findSchedulingCase(id);
  if (!caseRow) throw new Error(`Case ${id} not found`);
  const participants = caseRow.participants.map((participant) => ({
    ...participant,
    response: "pending" as const,
    accepted_slot_id: undefined,
    response_note: undefined,
    responded_at: undefined,
    responded_mail_id: undefined,
  }));
  const updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    applyNextAction({
      ...caseRow,
      status: "proposing",
      participants,
      proposed_slots: [],
      proposal_revision: caseRow.proposal_revision + 1,
      pending_slot_id: undefined,
      calendar_sync: "not_requested",
      calendar_sync_error: undefined,
      calendar_synced_at: undefined,
      reminder_due_at: undefined,
      reminder_targets: [],
      ceo_question_id: undefined,
      exception_reason: undefined,
      updated_at: new Date().toISOString(),
    })
  );
  recordSchedulingLifecycleEvent(updated.id, "rescheduled", "cli");
  const persisted = findSchedulingCase(updated.id);
  if (!persisted) throw new Error(`Case ${id} not found`);
  return persisted;
}
