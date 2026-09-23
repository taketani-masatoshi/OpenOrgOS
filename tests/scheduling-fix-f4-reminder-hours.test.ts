import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  seedDryRunMailConfig,
  seedSchedulingContacts,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { loadCorrespondenceDraft } from "../src/lib/correspondence/draft.js";
import { resolveMailConfig } from "../src/lib/correspondence/mail-config.js";
import { sendApprovedCorrespondence } from "../src/lib/correspondence/send-gate.js";
import { ensureSchedulingCorrespondenceDrafts } from "../src/lib/scheduling-coordination/correspondence-drafts.js";
import {
  findSchedulingCase,
  upsertSchedulingCase,
} from "../src/lib/scheduling-coordination/store.js";
import { refreshSchedulingReminder } from "../src/lib/scheduling-coordination/workflow.js";
import { approveFromStewardChat } from "../src/lib/steward-chat/wire-approve.js";

const tenantId = "test-scheduling-fix-f4";
const user = {
  operator_id: "ceo-test",
  approver_id: "Test CEO",
  mode: "dev" as const,
};

describe("F4 reminder due uses scheduling_reminder_after_hours", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    seedSchedulingContacts();
    seedDryRunMailConfig();
  });
  afterEach(() => cleanupSchedulingTenant(tenantId));

  it("send path stamps reminder_due_at from config hours, not +7 calendar days", async () => {
    const hours = resolveMailConfig().receive.scheduling_reminder_after_hours;
    expect(hours).toBe(72);
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-970", 2),
      status: "proposing",
    });
    const drafted = ensureSchedulingCorrespondenceDrafts(initial.id, "proposal");
    for (const record of drafted.correspondence) {
      const draft = loadCorrespondenceDraft(record.draft_id);
      await approveFromStewardChat(draft.approval_id!, user, { reviewed: true });
      await sendApprovedCorrespondence({ draftId: record.draft_id, operatorId: "ceo-test" });
    }
    const updated = findSchedulingCase(initial.id)!;
    expect(updated.reminder_due_at).toMatch(/T/);
    const dueMs = new Date(updated.reminder_due_at!).getTime();
    const baseMs = new Date(updated.updated_at).getTime();
    expect(Math.abs(dueMs - (baseMs + hours * 3600_000))).toBeLessThan(5_000);
  });

  it("reminder targets empty at +71h and populated at +73h", () => {
    const sentAt = new Date("2026-09-01T00:00:00.000Z");
    const dueAt = new Date(sentAt.getTime() + 72 * 3600_000).toISOString();
    upsertSchedulingCase({
      ...schedulingCase("SCH-2026-971", 2),
      status: "awaiting_responses",
      reminder_due_at: dueAt,
      reminder_targets: [],
      reminder_history: [],
      correspondence: [
        {
          kind: "proposal",
          participant_id: "PART-001",
          draft_id: "DR-971-1",
          proposal_revision: 0,
          drafted_at: sentAt.toISOString(),
          sent_at: sentAt.toISOString(),
        },
        {
          kind: "proposal",
          participant_id: "PART-002",
          draft_id: "DR-971-2",
          proposal_revision: 0,
          drafted_at: sentAt.toISOString(),
          sent_at: sentAt.toISOString(),
        },
      ],
    });

    const early = refreshSchedulingReminder(
      "SCH-2026-971",
      new Date(sentAt.getTime() + 71 * 3600_000)
    );
    expect(early.reminder_targets).toEqual([]);

    const late = refreshSchedulingReminder(
      "SCH-2026-971",
      new Date(sentAt.getTime() + 73 * 3600_000)
    );
    expect(late.reminder_targets.length).toBeGreaterThan(0);
  });
});
