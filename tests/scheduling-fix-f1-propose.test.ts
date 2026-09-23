import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupSchedulingTenant,
  seedSchedulingContacts,
  seedSchedulingTenant,
  schedulingCase,
} from "./helpers/scheduling-fixture.js";
import {
  openSchedulingCase,
  proposeSchedulingCaseSlots,
} from "../src/lib/scheduling-coordination/case-mutations.js";
import { insertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";

const tenantId = "test-scheduling-fix-f1";

describe("F1 CLI propose aligns with proposeSlotsOntoSchedulingCase", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    seedSchedulingContacts();
  });
  afterEach(() => cleanupSchedulingTenant(tenantId));

  it("rejects propose while CEO intake is pending", () => {
    const row = {
      ...schedulingCase("SCH-2026-800", 1),
      status: "awaiting_ceo" as const,
      ceo_intake_confirmed: false,
      purpose: undefined,
      meeting_format: "unspecified" as const,
      exception_reason: "schedule_intake_pending",
      proposed_slots: [],
    };
    insertSchedulingCase(row);
    expect(() => proposeSchedulingCaseSlots({ id: row.id, count: 2 })).toThrow(
      /CEO intake pending/
    );
  });

  it("uses evening slots for meal-like cases", () => {
    const row = {
      ...schedulingCase("SCH-2026-801", 1),
      title: "会食",
      status: "proposing" as const,
      ceo_intake_confirmed: true,
      meeting_format: "in_person" as const,
      location: "花遊膳 京都",
      purpose: "会食",
      cost_estimate: "お一人さま税込12,000円前後を目安とし、当方にてご負担いたします",
      proposed_slots: [],
      exception_reason: undefined,
    };
    insertSchedulingCase(row);
    const updated = proposeSchedulingCaseSlots({ id: row.id, count: 2 });
    expect(updated.proposed_slots.length).toBeGreaterThan(0);
    const hours = updated.proposed_slots.map((s) => Number(s.start.slice(11, 13)));
    expect(hours.every((h) => h >= 17)).toBe(true);
  });
});
