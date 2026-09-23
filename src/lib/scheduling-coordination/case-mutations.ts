import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { currentDate } from "../utils.js";
import { mutateSchedulingCase } from "./case-command.js";
import { ensureSchedulingCorrespondenceDrafts } from "./correspondence-drafts.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle-events.js";
import { proposeExecutiveSlots } from "./slots.js";
import {
  findSchedulingCase,
  insertSchedulingCase,
  loadSchedulingCases,
  nextParticipantId,
  nextSchedulingCaseId,
} from "./store.js";
import { applySchedulingTransition } from "./transitions.js";
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
  now?: Date;
}): SchedulingCase {
  const file = loadSchedulingCases();
  const now = opts.now ?? new Date();
  // open transition ignores the prior row
  const caseRow = applySchedulingTransition(
    undefined as unknown as SchedulingCase,
    {
      type: "open",
      id: nextSchedulingCaseId(file.cases),
      title: opts.title,
      participants: buildSchedulingParticipants(opts.participants),
      durationMinutes: opts.durationMinutes ?? 60,
      searchFrom: opts.searchFrom,
      searchTo: opts.searchTo,
      meetingFormat: opts.meetingFormat,
      location: opts.location,
    },
    now
  );
  insertSchedulingCase(caseRow);
  recordSchedulingLifecycleEvent(caseRow.id, "created", opts.actor ?? "cli");
  return caseRow;
}

export function proposeSchedulingCaseSlots(opts: {
  id: string;
  from?: string;
  to?: string;
  count?: number;
  now?: Date;
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

  let updated = mutateSchedulingCase(
    opts.id,
    { type: "propose", slots },
    { now: opts.now }
  );
  if (updated.next_action === "send_proposal") {
    updated = ensureSchedulingCorrespondenceDrafts(updated.id, "proposal");
  }
  if (updated.next_action === "ceo_confirm") {
    updated = advanceSchedulingWorkflow(updated.id, opts.now);
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
  now?: Date;
}): SchedulingCase {
  let updated = mutateSchedulingCase(
    opts.id,
    {
      type: "respond",
      email: opts.email,
      participantId: opts.participantId,
      response: opts.response,
      slotId: opts.slotId,
      mailId: opts.mailId,
      note: opts.note,
    },
    { now: opts.now }
  );
  if (updated.next_action === "ceo_confirm") {
    updated = advanceSchedulingWorkflow(updated.id, opts.now);
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

export function markSchedulingCaseSlotConfirmed(
  id: string,
  slotId: string,
  now?: Date
): SchedulingCase {
  return mutateSchedulingCase(id, { type: "confirmSlot", slotId }, { now });
}

export function closeSchedulingCase(id: string, now?: Date): SchedulingCase {
  return mutateSchedulingCase(id, { type: "close" }, { now });
}

export function cancelSchedulingCase(
  id: string,
  reason?: string,
  now?: Date
): SchedulingCase {
  mutateSchedulingCase(id, { type: "cancel", reason }, { now });
  return recordSchedulingLifecycleEvent(id, "cancelled", "cli");
}

export function rescheduleSchedulingCase(id: string, now?: Date): SchedulingCase {
  const updated = mutateSchedulingCase(id, { type: "reschedule" }, { now });
  recordSchedulingLifecycleEvent(updated.id, "rescheduled", "cli");
  const persisted = findSchedulingCase(updated.id);
  if (!persisted) throw new Error(`Case ${id} not found`);
  return persisted;
}
