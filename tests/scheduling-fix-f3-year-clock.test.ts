import { describe, expect, it } from "vitest";
import { nextSchedulingCaseId } from "../src/lib/scheduling-coordination/store.js";
import { parseScheduleReplyText } from "../src/lib/scheduling-coordination/reply-parse.js";
import { schedulingCase } from "./helpers/scheduling-fixture.js";

describe("F3 injected now for year", () => {
  it("nextSchedulingCaseId uses injected now year", () => {
    const id = nextSchedulingCaseId([], new Date("2031-06-15T00:00:00Z"));
    expect(id).toBe("SCH-2031-001");
  });

  it("parseScheduleReplyText Japanese month/day uses injected now year", () => {
    const parsed = parseScheduleReplyText(
      "9月1日でお願いします。",
      schedulingCase().proposed_slots,
      new Date("2030-01-10T00:00:00Z")
    );
    expect(
      parsed.counter_dates.some((d) => d.startsWith("2030-09-01")) ||
        parsed.counter_slots.some((s) => s.start.startsWith("2030-09-01"))
    ).toBe(true);
  });
});
