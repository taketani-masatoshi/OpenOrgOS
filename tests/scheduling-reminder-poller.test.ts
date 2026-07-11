import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCorrespondenceDraft } from "../src/lib/correspondence/draft.js";
import { clearSecretaryDraftToneCacheForTests } from "../src/lib/secretary/tenant-behavior.js";
import { runSchedulingReminderPoll } from "../src/lib/scheduling-coordination/reminder-poller.js";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import { findSchedulingCase, upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  schedulingTriage,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

const tenantId = "test-scheduling-reminder-poller";

describe("scheduling reminder poller", () => {
  beforeEach(() => {
    clearSecretaryDraftToneCacheForTests();
    seedSchedulingTenant(tenantId);
  });

  afterEach(() => {
    clearSecretaryDraftToneCacheForTests();
    cleanupSchedulingTenant(tenantId);
  });

  it("drafts reminders without mail auto-process", async () => {
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-710", 4),
      reminder_due_at: "2026-01-01T00:00:00.000Z",
    });
    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-REMINDER-ALICE",
        caseId: initial.id,
        from: "Alice <alice@example.com>",
        fixture: "accept-slot-1.eml",
      })
    );

    const result = runSchedulingReminderPoll(new Date("2027-01-04T00:00:00.000Z"));
    expect(result.drafted).toBe(1);
    expect(result.case_ids).toEqual([initial.id]);

    const updated = findSchedulingCase(initial.id)!;
    const reminders = updated.correspondence.filter((item) => item.kind === "reminder");
    expect(reminders.map((item) => item.participant_id).sort()).toEqual([
      "PART-002",
      "PART-003",
      "PART-004",
    ]);
    expect(
      loadCorrespondenceDraft(reminders[0]!.draft_id).body
    ).toContain("お手数ですがご回答をお願いいたします。");
  });
});
