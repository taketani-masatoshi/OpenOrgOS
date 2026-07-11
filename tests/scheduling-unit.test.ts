import { describe, expect, it } from "vitest";
import { applyNextAction } from "../src/lib/scheduling-coordination/next-action.js";
import { parseScheduleReplyText } from "../src/lib/scheduling-coordination/reply-parse.js";
import { schedulingCase } from "./helpers/scheduling-fixture.js";

describe("scheduling pure unit behavior", () => {
  it("moves four matching accepts to one CEO confirmation", () => {
    const row = schedulingCase();
    const result = applyNextAction({
      ...row,
      participants: row.participants.map((participant) => ({
        ...participant,
        response: "accept" as const,
        accepted_slot_id: "SLOT-001",
      })),
    });
    expect(result).toMatchObject({
      status: "awaiting_ceo",
      next_action: "ceo_confirm",
    });
    expect(result.exception_reason).toBeUndefined();
  });

  it("detects split acceptance without silently selecting a slot", () => {
    const row = schedulingCase("SCH-2026-703", 2);
    const result = applyNextAction({
      ...row,
      participants: [
        { ...row.participants[0]!, response: "accept", accepted_slot_id: "SLOT-001" },
        { ...row.participants[1]!, response: "accept", accepted_slot_id: "SLOT-002" },
      ],
    });
    expect(result.exception_reason).toBe("schedule_split_accept");
    expect(result.pending_slot_id).toBeUndefined();
  });

  it("keeps a low-confidence or ambiguous response out of automatic updates", () => {
    const parsed = parseScheduleReplyText(
      "どちらも検討します。別の日も可能です。",
      schedulingCase().proposed_slots
    );
    expect(parsed.response).toBe("unknown");
    expect(parsed.needs_review).toBe(true);
  });
});
