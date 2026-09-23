/**
 * Pure scheduling transitions — no filesystem, no tenant fixtures.
 */
import { describe, expect, it } from "vitest";
import { applyNextAction } from "../src/lib/scheduling-coordination/next-action.js";
import { applySchedulingTransition } from "../src/lib/scheduling-coordination/transitions.js";
import { planScheduleReply } from "../src/lib/scheduling-coordination/reply-plan.js";
import { schedulingCase } from "./helpers/scheduling-fixture.js";

const NOW = new Date("2026-09-24T12:00:00.000Z");

describe("scheduling transitions (pure)", () => {
  it.each([
    {
      name: "close",
      transition: { type: "close" as const },
      expect: { status: "closed", next_action: "none" },
    },
    {
      name: "cancel",
      transition: { type: "cancel" as const, reason: "ceo_abort" },
      expect: { status: "cancelled", next_action: "none", exception_reason: "ceo_abort" },
    },
    {
      name: "confirmSlot",
      transition: { type: "confirmSlot" as const, slotId: "SLOT-001" },
      expect: { status: "confirmed", pending_slot_id: "SLOT-001" },
    },
  ])("$name", ({ transition, expect: expected }) => {
    const row = schedulingCase();
    const next = applySchedulingTransition(row, transition, NOW);
    expect(next).toMatchObject(expected);
    expect(next.updated_at).toBe(NOW.toISOString());
  });

  it("reschedule clears answers, slots, reminders, and bumps proposal_revision", () => {
    const row = {
      ...schedulingCase(),
      proposal_revision: 2,
      reminder_due_at: "2026-09-25T00:00:00.000Z",
      reminder_targets: ["PART-001"],
      ceo_question_id: "Q-1",
      pending_slot_id: "SLOT-001",
      participants: schedulingCase().participants.map((p) => ({
        ...p,
        response: "accept" as const,
        accepted_slot_id: "SLOT-001",
        responded_at: "2026-09-20T00:00:00.000Z",
      })),
    };
    const next = applySchedulingTransition(row, { type: "reschedule" }, NOW);
    expect(next.status).toBe("proposing");
    expect(next.proposed_slots).toEqual([]);
    expect(next.proposal_revision).toBe(3);
    expect(next.reminder_due_at).toBeUndefined();
    expect(next.reminder_targets).toEqual([]);
    expect(next.ceo_question_id).toBeUndefined();
    expect(next.pending_slot_id).toBeUndefined();
    expect(next.participants.every((p) => p.response === "pending")).toBe(true);
  });

  it("respond marks participant and moves open→awaiting_responses", () => {
    const row = { ...schedulingCase(), status: "proposing" as const };
    const next = applySchedulingTransition(
      row,
      {
        type: "respond",
        email: "alice@example.com",
        response: "accept",
        slotId: "SLOT-001",
      },
      NOW
    );
    expect(next.status).toBe("awaiting_responses");
    const alice = next.participants.find((p) => p.email === "alice@example.com");
    expect(alice).toMatchObject({
      response: "accept",
      accepted_slot_id: "SLOT-001",
      responded_at: NOW.toISOString(),
    });
  });

  it("propose attaches slots and sets proposing", () => {
    const row = { ...schedulingCase(), status: "open" as const, proposed_slots: [] };
    const slots = [
      {
        id: "SLOT-001",
        start: "2026-09-25T10:00",
        end: "2026-09-25T11:00",
      },
    ];
    const next = applySchedulingTransition(row, { type: "propose", slots }, NOW);
    expect(next.proposed_slots).toEqual(slots);
    expect(next.status).toBe("proposing");
  });

  it("reminderDrafted appends history and removes target", () => {
    const row = {
      ...schedulingCase(),
      reminder_targets: ["PART-001", "PART-002"],
      reminder_history: [],
      proposal_revision: 1,
    };
    const next = applySchedulingTransition(
      row,
      { type: "reminderDrafted", participantId: "PART-001", draftId: "DR-1" },
      NOW
    );
    expect(next.reminder_targets).toEqual(["PART-002"]);
    expect(next.reminder_history).toEqual([
      {
        proposal_revision: 1,
        participant_id: "PART-001",
        drafted_at: NOW.toISOString(),
        draft_id: "DR-1",
      },
    ]);
  });

  it("ceoCancel clears slots; ceoManual sets needs_review", () => {
    const row = schedulingCase();
    expect(applySchedulingTransition(row, { type: "ceoCancel" }, NOW)).toMatchObject({
      status: "cancelled",
      proposed_slots: [],
      next_action: "none",
    });
    expect(applySchedulingTransition(row, { type: "ceoManual" }, NOW)).toMatchObject({
      status: "needs_review",
      exception_reason: "schedule_manual_coordination",
    });
  });

  it("applyNextAction uses injected venue reservation (no I/O)", () => {
    const base = {
      ...schedulingCase(),
      meeting_format: "in_person" as const,
      location: "花遊膳 京都本店",
      status: "confirmed" as const,
      pending_slot_id: "SLOT-001",
      venue_reservation_id: "VR-2026-001",
      calendar_sync: "synced" as const,
    };
    const pending = applyNextAction(base, { venueReservation: null });
    expect(pending.exception_reason).toBe("schedule_venue_reservation_pending");
    expect(pending.next_action).toBe("none");

    const clear = applyNextAction(base, {
      venueReservation: { status: "confirmed", external_ref: "HP123" },
    });
    expect(clear.exception_reason).toBeUndefined();
    expect(clear.next_action).toBe("send_confirmation");
  });

  it("planScheduleReply marks unknown sender as needs_review without store", () => {
    const row = schedulingCase();
    const plan = planScheduleReply({
      caseRow: row,
      mailId: "MAIL-1",
      from: "stranger@example.com",
      body: "承知しました。8/20でお願いします。",
      now: NOW,
      nextSlotId: () => "SLOT-099",
      proposeSlots: () => [],
    });
    expect(plan.recognized).toBe(false);
    expect(plan.nextRow.status).toBe("needs_review");
    expect(plan.nextRow.exception_reason).toBe("schedule_sender_not_participant");
    expect(plan.followUp).toBe("none");
  });
});
