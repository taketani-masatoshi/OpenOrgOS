import { describe, expect, it } from "vitest";
import { schedulingCaseSchema } from "../schemas/executive/scheduling-cases.js";
import {
  buildSchedulingCeoChoices,
  resolveSchedulingCeoChoice,
} from "../src/lib/scheduling-coordination/ceo-choice.js";
import { applyNextAction } from "../src/lib/scheduling-coordination/next-action.js";

function baseCase() {
  const now = new Date().toISOString();
  return schedulingCaseSchema.parse({
    id: "SCH-2026-920",
    title: "CEO choice test",
    status: "awaiting_ceo",
    created_at: now,
    updated_at: now,
    participants: [
      {
        id: "PART-001",
        name: "A",
        email: "a@example.com",
        response: "accept",
        accepted_slot_id: "SLOT-001",
      },
      {
        id: "PART-002",
        name: "B",
        email: "b@example.com",
        response: "accept",
        accepted_slot_id: "SLOT-002",
      },
    ],
    proposed_slots: [
      { id: "SLOT-001", start: "2026-08-20T10:00", end: "2026-08-20T11:00" },
      { id: "SLOT-002", start: "2026-08-21T10:00", end: "2026-08-21T11:00" },
    ],
    pending_slot_id: "SLOT-001",
    next_action: "ceo_confirm",
  });
}

describe("scheduling CEO unified choice", () => {
  it("builds one choice field for unanimous, split, and counter-limit cases", () => {
    const unanimous = buildSchedulingCeoChoices(baseCase());
    expect(unanimous.fieldId).toBe("schedule_ceo_choice");
    expect(unanimous.choices[0]).toContain("はい");

    const split = buildSchedulingCeoChoices(
      applyNextAction({
        ...baseCase(),
        exception_reason: "schedule_split_accept",
      })
    );
    expect(split.choices).toEqual(
      expect.arrayContaining([
        expect.stringContaining("SLOT-001"),
        expect.stringContaining("SLOT-002"),
        "再提案",
        "中止",
      ])
    );

    const counter = buildSchedulingCeoChoices({
      ...baseCase(),
      exception_reason: "schedule_counter_limit",
    });
    expect(counter.choices).toEqual(["手動調整", "中止"]);
  });

  it("parses unified and legacy answers into the same actions", () => {
    const unanimous = baseCase();
    expect(
      resolveSchedulingCeoChoice(
        {
          id: "CEO-Q-1",
          mail_id: "scheduling:SCH-2026-920",
          subject: "x",
          context_l1: "x",
          fields: [],
          status: "answered",
          asked_at: "",
          answers: { schedule_ceo_choice: "はい（確定・通知送信）" },
        },
        unanimous
      )
    ).toEqual({ kind: "confirm_slot", slotId: "SLOT-001" });

    expect(
      resolveSchedulingCeoChoice(
        {
          id: "CEO-Q-2",
          mail_id: "scheduling:SCH-2026-920",
          subject: "x",
          context_l1: "x",
          fields: [],
          status: "answered",
          asked_at: "",
          answers: { schedule_confirm: "はい" },
        },
        unanimous
      )
    ).toEqual({ kind: "confirm_slot", slotId: "SLOT-001" });

    const split = applyNextAction({
      ...baseCase(),
      exception_reason: "schedule_split_accept",
    });
    expect(
      resolveSchedulingCeoChoice(
        {
          id: "CEO-Q-3",
          mail_id: "scheduling:SCH-2026-920",
          subject: "x",
          context_l1: "x",
          fields: [],
          status: "answered",
          asked_at: "",
          answers: { schedule_ceo_choice: "SLOT-002 2026-08-21T10:00（確定・通知）" },
        },
        split
      )
    ).toEqual({ kind: "confirm_slot", slotId: "SLOT-002" });
  });
});
