import type {
  SchedulingCase,
  SchedulingParticipant,
  SchedulingProposedSlot,
} from "../../../schemas/executive/scheduling-cases.js";
import type { SchedulingJudgmentContext } from "./judgment-context.js";
import { applyNextAction } from "./next-action.js";
import { interpretScheduleReply } from "./reply-interpret.js";
import { extractEmailAddress } from "./reply-parse.js";

export type ScheduleReplyPlan = {
  nextRow: SchedulingCase;
  recognized: boolean;
  parsed: ReturnType<typeof interpretScheduleReply>;
  participant: SchedulingParticipant | undefined;
  followUp: "none" | "counter_proposal_drafts";
};

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
 * Pure plan from a matched schedule reply: interpret → desired row fields.
 * Slot generation helpers are injected so this module stays free of ./store.
 */
export function planScheduleReply(input: {
  caseRow: SchedulingCase;
  mailId: string;
  from: string;
  body: string;
  now: Date;
  nextSlotId: (slots: SchedulingProposedSlot[]) => string;
  proposeSlots: (opts: {
    from: string;
    count: number;
    durationMinutes: number;
    existingSlots: SchedulingProposedSlot[];
  }) => SchedulingProposedSlot[];
  ctx?: SchedulingJudgmentContext;
}): ScheduleReplyPlan {
  const { caseRow, mailId, now } = input;
  const ctx = input.ctx ?? {};
  const email = extractEmailAddress(input.from);
  const participant = findParticipantByEmail(caseRow, email);
  const parsed = interpretScheduleReply(
    input.body,
    caseRow.proposed_slots,
    mailId,
    now
  );

  const threadIds = new Set(caseRow.mail_thread_ids);
  threadIds.add(mailId);

  let participants = caseRow.participants;
  if (participant && !parsed.needs_review && parsed.response !== "unknown") {
    participants = caseRow.participants.map((p) => {
      if (p.id !== participant.id) return p;
      return {
        ...p,
        response: parsed.response === "unknown" ? p.response : parsed.response,
        accepted_slot_id: parsed.response === "accept" ? parsed.slot_ids[0] : undefined,
        response_note: parsed.note ?? p.response_note,
        responded_at: now.toISOString(),
        responded_mail_id: mailId,
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
        ? [
            {
              id: input.nextSlotId(caseRow.proposed_slots),
              start: explicit.start,
              end: explicit.end ?? addMinutes(explicit.start, caseRow.duration_minutes),
              label: explicit.label,
            },
          ]
        : [];
      proposedSlots = [
        ...exact,
        ...input.proposeSlots({
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
  const desired = applyNextAction(
    {
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
        ? [...new Set([...caseRow.processed_mail_ids, mailId])]
        : caseRow.processed_mail_ids,
      exception_reason: recognized
        ? undefined
        : participant
          ? parsed.needs_review
            ? `schedule_reply_needs_review:${parsed.dissent.join("|") || "low_confidence"}`
            : "schedule_reply_unknown"
          : "schedule_sender_not_participant",
      updated_at: now.toISOString(),
    },
    ctx
  );
  if (!recognized) {
    desired.status = "needs_review";
    desired.next_action = "none";
  }

  const followUp: ScheduleReplyPlan["followUp"] =
    recognized && parsed.response === "counter" ? "counter_proposal_drafts" : "none";

  return {
    nextRow: desired,
    recognized,
    parsed,
    participant,
    followUp,
  };
}
