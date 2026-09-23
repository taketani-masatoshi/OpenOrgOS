import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { dismissPendingSchedulingQuestions } from "../correspondence/ceo-inline-question.js";
import { findTriageEntry, upsertTriageEntry } from "../correspondence/mail-triage-queue.js";
import { writeInboundHandoffDraft } from "../correspondence/mail-handoff.js";
import { applyNextAction } from "./next-action.js";
import { interpretScheduleReply } from "./reply-interpret.js";
import { extractEmailAddress } from "./reply-parse.js";
import { proposeExecutiveSlots } from "./slots.js";
import {
  findSchedulingCase,
  nextSlotId,
  updateSchedulingCase,
} from "./store.js";
import type { ProcessScheduleMailResult } from "./process-mail-types.js";

function addMinutes(start: string, minutes: number): string {
  const value = new Date(`${start}:00`);
  value.setMinutes(value.getMinutes() + minutes);
  const date = [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
  const time = `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes()
  ).padStart(2, "0")}`;
  return `${date}T${time}`;
}

function findParticipantByEmail(
  caseRow: SchedulingCase,
  email: string
): SchedulingParticipant | undefined {
  const lower = email.toLowerCase();
  return caseRow.participants.find((p) => p.email?.toLowerCase() === lower);
}

/**
 * Apply an already-matched schedule reply onto a case: interpret body,
 * persist participant/slot updates, then optional counter follow-up drafts.
 * Does not perform case matching or safe-intake creation.
 */
export async function applyScheduleReplyToCase(opts: {
  entry: MailTriageEntry;
  caseRow: SchedulingCase;
  body: string;
  now?: Date;
}): Promise<ProcessScheduleMailResult> {
  const { entry } = opts;
  const now = opts.now ?? new Date();
  let caseRow = opts.caseRow;

  const email = extractEmailAddress(entry.from);
  const participant = findParticipantByEmail(caseRow, email);
  const parsed = interpretScheduleReply(opts.body, caseRow.proposed_slots, entry.id);

  const threadIds = new Set(caseRow.mail_thread_ids);
  threadIds.add(entry.id);

  let participants = caseRow.participants;
  if (participant && !parsed.needs_review && parsed.response !== "unknown") {
    participants = caseRow.participants.map((p) => {
      if (p.id !== participant.id) return p;
      return {
        ...p,
        response: parsed.response === "unknown" ? p.response : parsed.response,
        accepted_slot_id:
          parsed.response === "accept" ? parsed.slot_ids[0] : undefined,
        response_note: parsed.note ?? p.response_note,
        responded_at: now.toISOString(),
        responded_mail_id: entry.id,
      };
    });
  }

  let status = caseRow.status;
  if (status === "open" || status === "proposing") {
    status = "awaiting_responses";
  }

  let counterRound = caseRow.counter_round;
  let proposedSlots = caseRow.proposed_slots;
  let proposalRevision = caseRow.proposal_revision;
  if (participant && parsed.response === "counter" && !parsed.needs_review) {
    counterRound += 1;
    if (counterRound < 3) {
      const explicit = parsed.counter_slots.find((slot) => slot.start.includes("T"));
      const from =
        explicit?.start.slice(0, 10) ??
        parsed.counter_dates[0] ??
        caseRow.search_from ??
        now.toISOString().slice(0, 10);
      const exact = explicit
        ? [{
            id: nextSlotId(caseRow.proposed_slots),
            start: explicit.start,
            end: explicit.end ?? addMinutes(explicit.start, caseRow.duration_minutes),
            label: explicit.label,
          }]
        : [];
      proposedSlots = [
        ...exact,
        ...proposeExecutiveSlots({
          from,
          count: 3 - exact.length,
          durationMinutes: caseRow.duration_minutes,
          existingSlots: [...caseRow.proposed_slots, ...exact],
        }),
      ];
      proposalRevision += 1;
      participants = caseRow.participants.map((p) => ({
        ...p,
        response: "pending" as const,
        accepted_slot_id: undefined,
        response_note: undefined,
        responded_at: undefined,
        responded_mail_id: undefined,
      }));
      status = "proposing";
    } else {
      status = "awaiting_ceo";
    }
  }

  const recognized =
    Boolean(participant) && parsed.response !== "unknown" && !parsed.needs_review;
  const desired = applyNextAction({
    ...caseRow,
    participants,
    proposed_slots: proposedSlots,
    counter_round: counterRound,
    proposal_revision: proposalRevision,
    reminder_due_at: undefined,
    reminder_targets: [],
    ceo_question_id: undefined,
    pending_slot_id: undefined,
    mail_thread_ids: [...threadIds],
    status,
    processed_mail_ids: recognized
      ? [...new Set([...caseRow.processed_mail_ids, entry.id])]
      : caseRow.processed_mail_ids,
    exception_reason: recognized
      ? undefined
      : participant
        ? parsed.needs_review
          ? `schedule_reply_needs_review:${parsed.dissent.join("|") || "low_confidence"}`
          : "schedule_reply_unknown"
        : "schedule_sender_not_participant",
    updated_at: now.toISOString(),
  });
  if (!recognized) {
    desired.status = "needs_review";
    desired.next_action = "none";
  }
  caseRow = updateSchedulingCase(caseRow.id, caseRow.revision, () => desired);
  if (recognized && parsed.response === "counter") {
    dismissPendingSchedulingQuestions(caseRow.id);
    const refreshed = findSchedulingCase(caseRow.id);
    if (refreshed?.next_action === "send_proposal") {
      const { ensureSchedulingCorrespondenceDrafts } = await import("./correspondence-drafts.js");
      const { maybeAutoSendAuthorizedProposals } = await import("./delegated-send.js");
      ensureSchedulingCorrespondenceDrafts(refreshed.id, "proposal");
      caseRow = (await maybeAutoSendAuthorizedProposals(refreshed.id)) ?? refreshed;
    }
  }

  upsertTriageEntry({
    ...entry,
    scheduling_case_id: caseRow.id,
    schedule_reply_parsed: recognized,
    mail_thread_ids: [...new Set([...(entry.mail_thread_ids ?? []), ...caseRow.mail_thread_ids])],
  });

  try {
    writeInboundHandoffDraft(findTriageEntry(entry.id)!);
  } catch {
    // handoff optional
  }

  return {
    mail_id: entry.id,
    case_id: caseRow.id,
    action: recognized ? "updated" : "linked",
    reason: recognized
      ? `response=${parsed.response}`
      : `needs_review:${caseRow.exception_reason}`,
  };
}
