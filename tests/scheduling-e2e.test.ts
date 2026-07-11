import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  answerCeoInline,
  applyCeoInlineAnswerSideEffects,
  loadCeoInlineQueue,
} from "../src/lib/correspondence/ceo-inline-question.js";
import { listCorrespondenceDrafts, loadCorrespondenceDraft } from "../src/lib/correspondence/draft.js";
import { loadMailTriageQueue } from "../src/lib/correspondence/mail-triage-queue.js";
import { sendApprovedCorrespondence } from "../src/lib/correspondence/send-gate.js";
import { loadOrgApprovalRegistry } from "../src/lib/org/approval/index.js";
import {
  approveFromStewardChat,
  loadSchedulingCorrespondencePreview,
} from "../src/lib/steward-chat/wire-approve.js";
import { findPendingApprovalForCase } from "../src/lib/scheduling-coordination/ceo-confirm.js";
import { ensureSchedulingCorrespondenceDrafts } from "../src/lib/scheduling-coordination/lifecycle.js";
import { runSchedulingReminderPoll } from "../src/lib/scheduling-coordination/reminder-poller.js";
import { buildSchedulingTodayItem } from "../src/lib/scheduling-coordination/today-summary.js";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import { findSchedulingCase, upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import {
  advanceSchedulingWorkflow,
  refreshSchedulingReminder,
} from "../src/lib/scheduling-coordination/workflow.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  schedulingTriage,
  seedDryRunMailConfig,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

const tenantId = "test-scheduling-e2e";
const user = {
  operator_id: "ceo-test",
  approver_id: "Test CEO",
  mode: "dev" as const,
};

async function reviewApproveAndSendBatch(draftIds: string[]): Promise<void> {
  const drafts = draftIds.map(loadCorrespondenceDraft);
  const review = loadSchedulingCorrespondencePreview(drafts[0]!.approval_id!);
  expect(review.draft_ids).toEqual(expect.arrayContaining(draftIds));
  for (const draft of drafts) expect(review.preview).toContain(draft.body);
  const approval = await approveFromStewardChat(drafts[0]!.approval_id!, user, {
    reviewed: true,
  });
  expect(approval.approval_ids).toHaveLength(drafts.length);
  for (const draft of drafts) {
    const transport = await sendApprovedCorrespondence({
      draftId: draft.draft_id,
      operatorId: "ceo-test",
    });
    expect(transport.sendResult.mode).toBe("dry_run");
  }
}

describe("scheduling full secretary E2E", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    seedDryRunMailConfig();
    process.env.ORGOS_AUDIT_LOG_DISABLED = "1";
    process.env.ORGOS_AUDIT_BRIDGE_DISABLED = "1";
    process.env.GOOGLE_CALENDAR_ID = "primary";
    process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = "test-token";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ORGOS_AUDIT_LOG_DISABLED;
    delete process.env.ORGOS_AUDIT_BRIDGE_DISABLED;
    delete process.env.GOOGLE_CALENDAR_ID;
    delete process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    delete process.env.ORGOS_SMTP_USER;
    delete process.env.ORGOS_SMTP_PASSWORD;
    cleanupSchedulingTenant(tenantId);
  });

  it("runs preview approval through four accepts, CEO confirmation, Meet, notices, and closed", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "google-e2e-701",
          hangoutLink: "https://meet.google.com/e2e-room",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-707", 4),
      status: "proposing",
    });
    let persisted = ensureSchedulingCorrespondenceDrafts(initial.id, "proposal");
    expect(persisted.correspondence).toHaveLength(4);
    await reviewApproveAndSendBatch(persisted.correspondence.map((record) => record.draft_id));
    expect(findSchedulingCase(initial.id)?.status).toBe("awaiting_responses");

    for (const participant of initial.participants) {
      const entry = schedulingTriage({
        id: `MSG-E2E-${participant.id}`,
        caseId: initial.id,
        from: `${participant.name} <${participant.email}>`,
        fixture: "accept-slot-1.eml",
      });
      expect((await processScheduleMailEntry(entry)).action).toBe("updated");
    }
    persisted = advanceSchedulingWorkflow(initial.id);
    expect(persisted.participants.every((participant) => participant.response === "accept")).toBe(
      true
    );
    const question = loadCeoInlineQueue().questions.find(
      (item) => item.scheduling_case_id === initial.id && item.status === "pending"
    )!;
    expect(question.fields[0]?.label).toContain("確定");
    await applyCeoInlineAnswerSideEffects(
      answerCeoInline(
        question.id,
        { schedule_ceo_choice: "はい（確定・通知送信）" },
        "Test CEO"
      )
    );

    persisted = findSchedulingCase(initial.id)!;
    expect(persisted.status).toBe("closed");
    expect(persisted.next_action).toBe("none");
    expect(persisted.calendar_sync).toBe("synced");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(findPendingApprovalForCase(initial.id)).toBeUndefined();
    expect(buildSchedulingTodayItem(persisted).visible_to_ceo).toBe(false);
    const confirmations = persisted.correspondence.filter((item) => item.kind === "confirm");
    expect(confirmations).toHaveLength(4);
    for (const record of confirmations) {
      expect(loadCorrespondenceDraft(record.draft_id).body).toContain(
        "https://meet.google.com/e2e-room"
      );
      expect(record.sent_at).toBeTruthy();
    }

    const casesFile = YAML.parse(
      readFileSync(join(getDataDir(), "executive", "scheduling-cases.yaml"), "utf-8")
    );
    const finalCase = casesFile.cases.find((item: { id: string }) => item.id === initial.id);
    expect(finalCase.status).toBe("closed");
    expect(finalCase.lifecycle_events.map((item: { stage: string }) => item.stage)).toEqual(
      expect.arrayContaining(["proposal_sent", "confirmed", "notification_sent"])
    );
    expect(finalCase.correspondence.every((item: { sent_at?: string }) => item.sent_at)).toBe(true);

    const calendar = YAML.parse(
      readFileSync(join(getDataDir(), "executive", "calendar.yaml"), "utf-8")
    );
    expect(calendar.events).toHaveLength(1);
    expect(calendar.events[0]).toMatchObject({
      google_event_id: "google-e2e-701",
      meet_url: "https://meet.google.com/e2e-room",
    });
    expect(loadMailTriageQueue().entries.filter((entry) => entry.schedule_reply_parsed)).toHaveLength(
      4
    );
    expect(loadCeoInlineQueue().questions.find((item) => item.id === question.id)?.status).toBe(
      "answered"
    );
    expect(listCorrespondenceDrafts().filter((draft) => draft.status === "sent")).toHaveLength(8);
    expect(
      loadOrgApprovalRegistry().approvals.filter((approval) => approval.status === "completed")
    ).toHaveLength(8);
  });

  it("converges accept decline counter and pending with two CEO touches via delegated reproposal", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "google-e2e-mixed",
          hangoutLink: "https://meet.google.com/mixed-room",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-711", 4),
      status: "proposing",
    });
    let persisted = ensureSchedulingCorrespondenceDrafts(initial.id, "proposal");
    await reviewApproveAndSendBatch(persisted.correspondence.map((record) => record.draft_id));

    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-MIX-ALICE",
        caseId: initial.id,
        from: "Alice <alice@example.com>",
        fixture: "accept-slot-1.eml",
      })
    );
    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-MIX-BOB",
        caseId: initial.id,
        from: "Bob <bob@example.com>",
        fixture: "decline-slot.eml",
      })
    );
    let mixed = findSchedulingCase(initial.id)!;
    expect(mixed.participants.map((p) => p.response)).toEqual([
      "accept",
      "decline",
      "pending",
      "pending",
    ]);

    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-MIX-CAROL",
        caseId: initial.id,
        from: "Carol <carol@example.com>",
        fixture: "counter-slot.eml",
      })
    );
    const reproposed = findSchedulingCase(initial.id)!;
    expect(reproposed).toMatchObject({
      counter_round: 1,
      proposal_revision: 1,
      status: "awaiting_responses",
      next_action: "none",
    });
    expect(reproposed.participants.every((p) => p.response === "pending")).toBe(true);
    expect(
      reproposed.correspondence.filter(
        (record) => record.kind === "proposal" && record.proposal_revision === 1
      )
    ).toHaveLength(4);
    expect(
      reproposed.correspondence
        .filter((record) => record.kind === "proposal" && record.proposal_revision === 1)
        .every((record) => record.sent_at)
    ).toBe(true);
    expect(reproposed.proposal_send_authority?.covers_up_to_revision).toBe(1);

    const revisedSlotId = reproposed.proposed_slots.find(
      (slot) => slot.start === "2026-08-25T14:00"
    )!.id;

    for (const participant of ["PART-001", "PART-002", "PART-003"]) {
      const row = initial.participants.find((p) => p.id === participant)!;
      await processScheduleMailEntry(
        schedulingTriage({
          id: `MSG-MIX-REVISED-${participant}`,
          caseId: initial.id,
          from: `${row.name} <${row.email}>`,
          fixture: "accept-counter.eml",
        })
      );
    }
    const beforeReminder = findSchedulingCase(initial.id)!;
    expect(beforeReminder.participants.filter((p) => p.response === "accept")).toHaveLength(3);
    expect(beforeReminder.participants.find((p) => p.id === "PART-004")?.response).toBe("pending");

    const reminderResult = runSchedulingReminderPoll(new Date("2027-01-04T00:00:00.000Z"));
    expect(reminderResult.drafted).toBe(1);
    const reminded = findSchedulingCase(initial.id)!;
    expect(reminded.correspondence.some((item) => item.kind === "reminder")).toBe(true);

    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-MIX-DAVE",
        caseId: initial.id,
        from: "Dave <dave@example.com>",
        fixture: "accept-counter.eml",
      })
    );
    persisted = advanceSchedulingWorkflow(initial.id);
    expect(persisted.participants.every((p) => p.accepted_slot_id === revisedSlotId)).toBe(true);

    const question = loadCeoInlineQueue().questions.find(
      (item) => item.scheduling_case_id === initial.id && item.status === "pending"
    )!;
    await applyCeoInlineAnswerSideEffects(
      answerCeoInline(
        question.id,
        { schedule_ceo_choice: "はい（確定・通知送信）" },
        "Test CEO"
      )
    );

    const finalCase = findSchedulingCase(initial.id)!;
    expect(finalCase.status).toBe("closed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(finalCase.correspondence.filter((item) => item.kind === "confirm").every((item) => item.sent_at)).toBe(
      true
    );
  });

  it("closes split accept via unified CEO slot choice with calendar and auto notifications", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "google-e2e-split",
          hangoutLink: "https://meet.google.com/split-room",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-713", 2),
      status: "proposing",
    });
    let persisted = ensureSchedulingCorrespondenceDrafts(initial.id, "proposal");
    await reviewApproveAndSendBatch(persisted.correspondence.map((record) => record.draft_id));

    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-SPLIT-ALICE",
        caseId: initial.id,
        from: "Alice <alice@example.com>",
        fixture: "accept-slot-1.eml",
      })
    );
    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-SPLIT-BOB",
        caseId: initial.id,
        from: "Bob <bob@example.com>",
        fixture: "accept-slot-2.eml",
      })
    );

    persisted = advanceSchedulingWorkflow(initial.id);
    expect(persisted.exception_reason).toBe("schedule_split_accept");
    const question = loadCeoInlineQueue().questions.find(
      (item) => item.scheduling_case_id === initial.id && item.status === "pending"
    )!;
    expect(question.fields[0]?.id).toBe("schedule_ceo_choice");

    await applyCeoInlineAnswerSideEffects(
      answerCeoInline(
        question.id,
        { schedule_ceo_choice: "SLOT-002 2026-08-21 10:00（確定・通知）" },
        "Test CEO"
      )
    );

    const finalCase = findSchedulingCase(initial.id)!;
    expect(finalCase.status).toBe("closed");
    expect(finalCase.pending_slot_id).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      finalCase.correspondence
        .filter((item) => item.kind === "confirm")
        .every((item) => item.sent_at)
    ).toBe(true);
    expect(
      loadCorrespondenceDraft(
        finalCase.correspondence.find((item) => item.kind === "confirm")!.draft_id
      ).body
    ).toContain("https://meet.google.com/split-room");
  });

  it("turns a partial answer into participant-specific reminder drafts only", async () => {
    const initial = upsertSchedulingCase({
      ...schedulingCase("SCH-2026-708", 4),
      reminder_due_at: "2026-01-01T00:00:00.000Z",
    });
    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-PARTIAL-ALICE",
        caseId: initial.id,
        from: "Alice <alice@example.com>",
        fixture: "accept-slot-1.eml",
      })
    );
    refreshSchedulingReminder(initial.id, new Date("2027-01-04T00:00:00.000Z"));
    const reminded = ensureSchedulingCorrespondenceDrafts(initial.id, "reminder");
    const reminderRecords = reminded.correspondence.filter((item) => item.kind === "reminder");
    expect(reminderRecords.map((item) => item.participant_id).sort()).toEqual([
      "PART-002",
      "PART-003",
      "PART-004",
    ]);
    expect(
      reminderRecords.map((item) => loadCorrespondenceDraft(item.draft_id).to).sort()
    ).toEqual(["bob@example.com", "carol@example.com", "dave@example.com"]);
    expect(findSchedulingCase(initial.id)?.participants[0]?.response).toBe("accept");
  });

  it("applies an .eml counter, reproposes, and converges on the revised slot", async () => {
    const initial = upsertSchedulingCase(schedulingCase("SCH-2026-709", 2));
    await processScheduleMailEntry(
      schedulingTriage({
        id: "MSG-COUNTER-CAROL",
        caseId: initial.id,
        from: "Bob <bob@example.com>",
        fixture: "counter-slot.eml",
      })
    );
    const revised = findSchedulingCase(initial.id)!;
    expect(revised).toMatchObject({ counter_round: 1, proposal_revision: 1, status: "proposing" });
    const revisedSlotId = revised.proposed_slots.find(
      (slot) => slot.start === "2026-08-25T14:00"
    )!.id;
    for (const participant of revised.participants) {
      await processScheduleMailEntry(
        schedulingTriage({
          id: `MSG-REVISED-${participant.id}`,
          caseId: revised.id,
          from: `${participant.name} <${participant.email}>`,
          fixture: "accept-counter.eml",
        })
      );
    }
    const converged = advanceSchedulingWorkflow(initial.id);
    expect(converged.status).toBe("awaiting_ceo");
    expect(converged.participants.every((participant) => participant.accepted_slot_id === revisedSlotId)).toBe(
      true
    );
  });
});
