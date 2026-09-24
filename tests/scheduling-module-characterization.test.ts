import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelSchedulingCase,
  rescheduleSchedulingCase,
} from "../src/lib/scheduling-coordination/case-mutations.js";
import {
  extractSchedulingChatDuration,
  extractSchedulingChatMeetingFormat,
  extractSchedulingChatParticipantCount,
  extractSchedulingChatTitle,
  isSchedulingChatIntent,
} from "../src/lib/scheduling-coordination/chat-parse.js";
import { SCHEDULE_VENUE_PENDING } from "../src/lib/scheduling-coordination/ceo-gates.js";
import { applyScheduleReplyToCase } from "../src/lib/scheduling-coordination/mail-reply.js";
import { persistSchedulingNextAction } from "../src/lib/scheduling-coordination/persist-next-action.js";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import {
  findSchedulingCase,
  upsertSchedulingCase,
} from "../src/lib/scheduling-coordination/store.js";
import { advanceSchedulingWorkflow } from "../src/lib/scheduling-coordination/workflow.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  schedulingTriage,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

const tenantId = "test-scheduling-module-char";

describe("scheduling module characterization", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
  });

  afterEach(() => {
    cleanupSchedulingTenant(tenantId);
  });

  describe("applyScheduleReplyToCase", () => {
    it("marks unknown senders as needs_review with schedule_sender_not_participant", async () => {
      const initial = upsertSchedulingCase(schedulingCase("SCH-2026-901", 2));
      const entry = schedulingTriage({
        id: "MSG-UNKNOWN-SENDER",
        caseId: initial.id,
        from: "Stranger <stranger@example.com>",
        fixture: "accept-slot-1.eml",
      });

      const result = await applyScheduleReplyToCase({
        entry,
        caseRow: initial,
        body: "第1候補でお願いします。",
      });

      expect(result.action).toBe("linked");
      expect(result.reason).toContain("needs_review");
      const updated = findSchedulingCase(initial.id)!;
      expect(updated.status).toBe("needs_review");
      expect(updated.exception_reason).toBe("schedule_sender_not_participant");
      expect(updated.processed_mail_ids).not.toContain(entry.id);
    });

    it("does not treat a reply that only names a retired slot id as a recognized accept", async () => {
      const initial = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-902", 2),
        proposed_slots: [
          {
            id: "SLOT-099",
            start: "2026-09-01T10:00",
            end: "2026-09-01T11:00",
            label: "2026-09-01 10:00",
          },
        ],
      });
      const entry = schedulingTriage({
        id: "MSG-STALE-SLOT",
        caseId: initial.id,
        from: "Alice <alice@example.com>",
        fixture: "accept-slot-1.eml",
      });

      const result = await applyScheduleReplyToCase({
        entry,
        caseRow: initial,
        body: "SLOT-001 でお願いします。",
      });

      const updated = findSchedulingCase(initial.id)!;
      expect(result.action).toBe("linked");
      expect(updated.status).toBe("needs_review");
      expect(updated.participants.find((p) => p.email === "alice@example.com")?.response).toBe(
        "pending"
      );
      expect(updated.exception_reason).toMatch(/schedule_reply/);
    });

    it("skips the same mail on re-entry through processScheduleMailEntry", async () => {
      const initial = upsertSchedulingCase(schedulingCase("SCH-2026-903", 2));
      const entry = schedulingTriage({
        id: "MSG-IDEMPOTENT",
        caseId: initial.id,
        from: "Alice <alice@example.com>",
        fixture: "accept-slot-1.eml",
      });

      const first = await processScheduleMailEntry(entry);
      expect(first.action).toBe("updated");
      const second = await processScheduleMailEntry(entry);
      expect(second.action).toBe("skipped");
      expect(second.reason).toBe("already processed");
    });

    it("does not auto-send a new proposal at the third counter even with stored authority", async () => {
      const initial = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-906", 2),
        status: "awaiting_responses",
        counter_round: 2,
        proposal_revision: 2,
        proposal_send_authority: {
          operator_id: "ceo-test",
          approver_name: "Test CEO",
          covers_up_to_revision: 2,
        },
      });

      await processScheduleMailEntry(
        schedulingTriage({
          id: "MSG-COUNTER-3-CHAR",
          caseId: initial.id,
          from: "Alice <alice@example.com>",
          fixture: "counter-slot.eml",
        })
      );

      const updated = findSchedulingCase(initial.id)!;
      expect(updated.counter_round).toBe(3);
      expect(updated.exception_reason).toBe("schedule_counter_limit");
      expect(updated.next_action).toBe("ceo_confirm");
      expect(
        updated.correspondence.filter(
          (record) => record.kind === "proposal" && record.proposal_revision === 3
        )
      ).toHaveLength(0);
    });
  });

  describe("persistSchedulingNextAction", () => {
    it("does not bump revision when status, next_action, and exception_reason are unchanged", () => {
      const seeded = upsertSchedulingCase(schedulingCase("SCH-2026-904", 2));
      const before = persistSchedulingNextAction(seeded);
      const after = persistSchedulingNextAction(before);
      expect(after.revision).toBe(before.revision);
      expect(after).toBe(before);
    });
  });

  describe("case-mutations", () => {
    it("reschedule clears answers, slots, reminders, and CEO question and bumps proposal_revision", () => {
      const initial = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-905", 2),
        proposal_revision: 2,
        pending_slot_id: "SLOT-001",
        ceo_question_id: "Q-1",
        reminder_due_at: "2026-08-01T00:00:00.000Z",
        reminder_targets: ["PART-001"],
        participants: schedulingCase("SCH-2026-905", 2).participants.map((participant) => ({
          ...participant,
          response: "accept" as const,
          accepted_slot_id: "SLOT-001",
          responded_at: "2026-07-01T00:00:00.000Z",
        })),
      });

      const updated = rescheduleSchedulingCase(initial.id);
      expect(updated.proposal_revision).toBe(3);
      expect(updated.proposed_slots).toEqual([]);
      expect(updated.pending_slot_id).toBeUndefined();
      expect(updated.ceo_question_id).toBeUndefined();
      expect(updated.reminder_due_at).toBeUndefined();
      expect(updated.reminder_targets).toEqual([]);
      expect(updated.participants.every((p) => p.response === "pending")).toBe(true);
      expect(updated.participants.every((p) => p.accepted_slot_id === undefined)).toBe(true);
      expect(updated.status).toBe("proposing");
    });

    it("fails when the case id does not exist", () => {
      expect(() => cancelSchedulingCase("SCH-2099-000")).toThrow(/not found/);
      expect(() => rescheduleSchedulingCase("SCH-2099-000")).toThrow(/not found/);
    });
  });

  describe("chat-parse", () => {
    it("extracts title, count, duration, and format from a representative message", () => {
      const message = "「役員会」の日程調整を3名で60分オンラインでお願いします";
      expect(isSchedulingChatIntent(message)).toBe(true);
      expect(extractSchedulingChatTitle(message)).toBe("役員会");
      expect(extractSchedulingChatParticipantCount(message)).toBe(3);
      expect(extractSchedulingChatDuration(message)).toBe(60);
      expect(extractSchedulingChatMeetingFormat(message)).toBe("online");
    });
  });

  describe("advanceSchedulingWorkflow", () => {
    it("persists updated_at from the injected now when status or next_action changes", () => {
      const now = new Date("2026-08-15T12:00:00.000Z");
      upsertSchedulingCase({
        ...schedulingCase("SCH-2026-910", 2),
        status: "open",
        next_action: "none",
        updated_at: "2026-08-01T00:00:00.000Z",
      });

      const updated = advanceSchedulingWorkflow("SCH-2026-910", now);
      expect(updated.status).toBe("proposing");
      expect(updated.next_action).toBe("send_proposal");
      expect(updated.updated_at).toBe(now.toISOString());
    });

    it("persists when only exception_reason changes (venue pending cleared)", () => {
      const now = new Date("2026-08-16T09:00:00.000Z");
      const initial = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-911", 2),
        status: "awaiting_responses",
        next_action: "none",
        meeting_format: "online",
        exception_reason: SCHEDULE_VENUE_PENDING,
        // Keep reminder not due so refreshSchedulingReminder does not change next_action.
        updated_at: now.toISOString(),
        reminder_due_at: "2099-01-01T00:00:00.000Z",
        reminder_targets: [],
      });

      const updated = advanceSchedulingWorkflow(initial.id, now);
      expect(updated.status).toBe("awaiting_responses");
      expect(updated.next_action).toBe("none");
      expect(updated.exception_reason).toBeUndefined();
      expect(updated.revision).toBeGreaterThan(initial.revision);
      expect(updated.updated_at).toBe(now.toISOString());
    });
  });
});
