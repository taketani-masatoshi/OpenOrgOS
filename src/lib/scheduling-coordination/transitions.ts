import type {
  SchedulingCase,
  SchedulingCaseInput,
  SchedulingParticipant,
  SchedulingProposedSlot,
} from "../../../schemas/executive/scheduling-cases.js";
import type { SchedulingJudgmentContext } from "./judgment-context.js";
import { applyNextAction } from "./next-action.js";

export type SchedulingTransition =
  | {
      type: "open";
      id: string;
      title: string;
      participants: SchedulingParticipant[];
      durationMinutes: number;
      searchFrom?: string;
      searchTo?: string;
      meetingFormat?: "online" | "in_person" | "unspecified";
      location?: string;
    }
  | {
      type: "propose";
      slots: SchedulingProposedSlot[];
    }
  | {
      type: "respond";
      email?: string;
      participantId?: string;
      response: "accept" | "decline" | "counter" | "pending" | "unknown";
      slotId?: string;
      mailId?: string;
      note?: string;
    }
  | { type: "confirmSlot"; slotId: string }
  | { type: "close" }
  | { type: "cancel"; reason?: string }
  | { type: "reschedule" }
  | { type: "ceoManual" }
  | { type: "ceoCancel" }
  | { type: "ceoRepropose" }
  | { type: "ceoInvalid" }
  | { type: "intakeContinue" }
  | { type: "intakeCancel" }
  | { type: "reminderRefresh"; dueAt: string; targets: string[] }
  | { type: "reminderDrafted"; participantId: string; draftId?: string }
  | {
      type: "replaceRow";
      /** Pre-built desired fields merged onto row before applyNextAction. */
      patch: Partial<SchedulingCaseInput>;
      /** When true, skip applyNextAction (cancel-style terminal write). */
      skipNextAction?: boolean;
    };

function withUpdatedAt(row: SchedulingCaseInput, now: Date): SchedulingCaseInput {
  return { ...row, updated_at: now.toISOString() };
}

/**
 * Pure state transition: (row, input, now) => row.
 * Does not read or write files. Callers load judgment ctx when venue facts matter.
 */
export function applySchedulingTransition(
  row: SchedulingCase,
  transition: SchedulingTransition,
  now: Date,
  ctx: SchedulingJudgmentContext = {}
): SchedulingCase {
  switch (transition.type) {
    case "open": {
      return applyNextAction(
        withUpdatedAt(
          {
            id: transition.id,
            title: transition.title,
            status: "open",
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            participants: transition.participants,
            proposed_slots: [],
            duration_minutes: transition.durationMinutes,
            search_from: transition.searchFrom,
            search_to: transition.searchTo,
            meeting_format: transition.meetingFormat,
            location: transition.location,
            mail_thread_ids: [],
            next_action: "propose_slots",
          },
          now
        ),
        ctx
      );
    }
    case "propose": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            proposed_slots: transition.slots,
            status: transition.slots.length ? "proposing" : row.status,
          },
          now
        ),
        ctx
      );
    }
    case "respond": {
      const participants = row.participants.map((participant) => {
        const matchEmail =
          transition.email &&
          participant.email?.toLowerCase() === transition.email.toLowerCase();
        const matchId =
          transition.participantId && participant.id === transition.participantId;
        if (!matchEmail && !matchId) return participant;
        return {
          ...participant,
          response: transition.response,
          accepted_slot_id: transition.slotId ?? participant.accepted_slot_id,
          response_note: transition.note ?? participant.response_note,
          responded_at: now.toISOString(),
          responded_mail_id: transition.mailId ?? participant.responded_mail_id,
        };
      });
      let status = row.status;
      if (status === "open" || status === "proposing") status = "awaiting_responses";
      return applyNextAction(
        withUpdatedAt({ ...row, participants, status }, now),
        ctx
      );
    }
    case "confirmSlot": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            status: "confirmed",
            pending_slot_id: transition.slotId,
          },
          now
        ),
        ctx
      );
    }
    case "close": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            status: "closed",
            next_action: "none",
          },
          now
        ),
        ctx
      );
    }
    case "cancel": {
      // Preserve historical cancel path: no applyNextAction (next_action forced none).
      return {
        ...row,
        status: "cancelled",
        next_action: "none",
        exception_reason: transition.reason,
        updated_at: now.toISOString(),
      };
    }
    case "reschedule": {
      const participants = row.participants.map((participant) => ({
        ...participant,
        response: "pending" as const,
        accepted_slot_id: undefined,
        response_note: undefined,
        responded_at: undefined,
        responded_mail_id: undefined,
      }));
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            status: "proposing",
            participants,
            proposed_slots: [],
            proposal_revision: row.proposal_revision + 1,
            pending_slot_id: undefined,
            calendar_sync: "not_requested",
            calendar_sync_error: undefined,
            calendar_synced_at: undefined,
            reminder_due_at: undefined,
            reminder_targets: [],
            ceo_question_id: undefined,
            exception_reason: undefined,
          },
          now
        ),
        ctx
      );
    }
    case "ceoManual": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            status: "needs_review",
            next_action: "none",
            ceo_question_id: undefined,
            exception_reason: "schedule_manual_coordination",
          },
          now
        ),
        ctx
      );
    }
    case "ceoCancel": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            status: "cancelled",
            next_action: "none",
            proposed_slots: [],
            pending_slot_id: undefined,
            ceo_question_id: undefined,
            exception_reason: undefined,
          },
          now
        ),
        ctx
      );
    }
    case "ceoRepropose": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            status: "proposing",
            proposed_slots: [],
            pending_slot_id: undefined,
            ceo_question_id: undefined,
            exception_reason: undefined,
          },
          now
        ),
        ctx
      );
    }
    case "ceoInvalid": {
      return {
        ...row,
        status: "needs_review",
        next_action: "none",
        ceo_question_id: undefined,
        exception_reason: "schedule_invalid_ceo_choice",
        updated_at: now.toISOString(),
      };
    }
    case "intakeContinue": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            status: "open",
            exception_reason: undefined,
          },
          now
        ),
        ctx
      );
    }
    case "intakeCancel": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            status: "cancelled",
            exception_reason: undefined,
          },
          now
        ),
        ctx
      );
    }
    case "reminderRefresh": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            reminder_due_at: transition.dueAt,
            reminder_targets: transition.targets,
          },
          now
        ),
        ctx
      );
    }
    case "reminderDrafted": {
      return applyNextAction(
        withUpdatedAt(
          {
            ...row,
            reminder_history: [
              ...row.reminder_history,
              {
                proposal_revision: row.proposal_revision,
                participant_id: transition.participantId,
                drafted_at: now.toISOString(),
                draft_id: transition.draftId,
              },
            ],
            reminder_targets: row.reminder_targets.filter(
              (id) => id !== transition.participantId
            ),
          },
          now
        ),
        ctx
      );
    }
    case "replaceRow": {
      const merged = withUpdatedAt({ ...row, ...transition.patch }, now);
      if (transition.skipNextAction) {
        return merged as SchedulingCase;
      }
      return applyNextAction(merged, ctx);
    }
  }
}
