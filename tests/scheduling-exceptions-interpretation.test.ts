import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { schedulingCaseSchema } from "../schemas/executive/scheduling-cases.js";
import { mailInterpretationResultSchema } from "../schemas/correspondence/mail-interpretation.js";
import { parseScheduleReplyText } from "../src/lib/scheduling-coordination/reply-parse.js";
import { interpretScheduleReply } from "../src/lib/scheduling-coordination/reply-interpret.js";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import { applyNextAction } from "../src/lib/scheduling-coordination/next-action.js";
import { ensureSchedulingCeoConfirmQuestion } from "../src/lib/scheduling-coordination/ceo-confirm.js";
import {
  seedSchedulingContacts,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import {
  markSchedulingReminderDrafted,
  refreshSchedulingReminder,
} from "../src/lib/scheduling-coordination/workflow.js";
import {
  findSchedulingCase,
  upsertSchedulingCase,
} from "../src/lib/scheduling-coordination/store.js";
import { saveMailInterpretation } from "../src/lib/correspondence/mail-interpretation.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";

const tenantId = "test-scheduling-exceptions";
const tenantRoot = join(getTenantsDir(), tenantId);
const slots = [
  { id: "SLOT-001", start: "2026-08-20T10:00", end: "2026-08-20T11:00" },
  { id: "SLOT-002", start: "2026-08-21T10:00", end: "2026-08-21T11:00" },
];

function seedFiles(): void {
  const executive = join(getDataDir(), "executive");
  mkdirSync(executive, { recursive: true });
  writeFileSync(join(executive, "scheduling-cases.yaml"), "version: 1\ncases: []\n");
  writeFileSync(join(executive, "calendar.yaml"), "events: []\n");
  writeFileSync(join(executive, "mail-triage-queue.yaml"), "version: 1\nentries: []\n");
  writeFileSync(join(executive, "mail-interpretation-queue.yaml"), "version: 1\nentries: []\n");
  writeFileSync(join(executive, "ceo-inline-questions.yaml"), "version: 1\nquestions: []\n");
  seedSchedulingContacts({ emails: ["a@example.com", "b@example.com"] });
}

function makeCase(id = "SCH-2026-801") {
  const now = new Date().toISOString();
  return schedulingCaseSchema.parse({
    id,
    title: "例外テスト",
    status: "awaiting_responses",
    created_at: now,
    updated_at: now,
    participants: [
      { id: "PART-001", name: "A", email: "a@example.com", response: "pending" },
      { id: "PART-002", name: "B", email: "b@example.com", response: "pending" },
    ],
    proposed_slots: slots,
  });
}

function triage(id: string, caseId: string, from = "A <a@example.com>", subject = "日程") {
  return upsertTriageEntry({
    id,
    received_at: new Date().toISOString(),
    from,
    subject,
    importance: "p2",
    urgency: "none",
    disposition: "ham",
    routing: "secretary",
    handoff_status: "pending",
    eml_ref: "records/executive/mail-received/missing.eml",
    rule_hits: ["schedule"],
    scheduling_case_id: caseId,
  });
}

describe("scheduling exceptions and interpretation", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    seedFiles();
  });

  afterEach(() => rmSync(tenantRoot, { recursive: true, force: true }));

  it("returns deterministic structured regex interpretation", () => {
    const result = parseScheduleReplyText("2026-08-20 で問題ありません。", slots);
    expect(result).toMatchObject({
      response: "accept",
      slot_ids: ["SLOT-001"],
      counter_slots: [],
      confidence: 0.9,
      dissent: [],
      needs_review: false,
    });
  });

  it("treats regex as one vote and sends split votes to review", () => {
    saveMailInterpretation(
      mailInterpretationResultSchema.parse({
        mail_id: "MSG-vote-split",
        interpreted_at: new Date().toISOString(),
        intent: "schedule",
        action_required: true,
        summary_l1: "参加できません",
        agreement: 1,
        dissent_notes: [],
        votes: [{
          model: "model-a",
          intent: "schedule",
          action_required: true,
          summary_l1: "参加できません",
          confidence: 0.95,
          response: "decline",
          slot_ids: [],
          counter_slots: [],
        }],
        needs_ceo_confirm: false,
        ceo_questions: [],
      })
    );
    const result = interpretScheduleReply(
      "2026-08-20 で問題ありません。",
      slots,
      "MSG-vote-split"
    );
    expect(result.response).toBe("unknown");
    expect(result.needs_review).toBe(true);
    expect(result.dissent).toContain("response vote tie");
  });

  it("does not apply a low-trust interpretation to a participant", async () => {
    const row = upsertSchedulingCase(makeCase());
    saveMailInterpretation(
      mailInterpretationResultSchema.parse({
        mail_id: "MSG-review",
        interpreted_at: new Date().toISOString(),
        intent: "schedule",
        action_required: true,
        summary_l1: "参加できません",
        agreement: 1,
        dissent_notes: [],
        votes: [{
          model: "model-a",
          intent: "schedule",
          action_required: true,
          summary_l1: "参加できません",
          confidence: 0.9,
          response: "decline",
        }],
        needs_ceo_confirm: false,
        ceo_questions: [],
      })
    );
    await processScheduleMailEntry(
      triage("MSG-review", row.id, "A <a@example.com>", "2026-08-20 で問題ありません")
    );
    const updated = findSchedulingCase(row.id)!;
    expect(updated.status).toBe("needs_review");
    expect(updated.participants[0]!.response).toBe("pending");
    expect(updated.processed_mail_ids).not.toContain("MSG-review");
  });

  it("uses one CEO slot choice for split accept instead of yes/no", () => {
    const split = applyNextAction({
      ...makeCase(),
      participants: [
        { ...makeCase().participants[0]!, response: "accept", accepted_slot_id: "SLOT-001" },
        { ...makeCase().participants[1]!, response: "accept", accepted_slot_id: "SLOT-002" },
      ],
    });
    expect(split.exception_reason).toBe("schedule_split_accept");
    const saved = upsertSchedulingCase(split);
    const question = ensureSchedulingCeoConfirmQuestion(saved)!;
    expect(question.fields).toHaveLength(1);
    expect(question.fields[0]!.id).toBe("schedule_ceo_choice");
    expect(question.fields[0]!.type).toBe("choice");
  });

  it("creates a new counter revision and invalidates old answers", async () => {
    const original = upsertSchedulingCase({
      ...makeCase(),
      participants: [
        { ...makeCase().participants[0]!, response: "pending" },
        { ...makeCase().participants[1]!, response: "accept", accepted_slot_id: "SLOT-001" },
      ],
    });
    await processScheduleMailEntry(
      triage("MSG-counter", original.id, "A <a@example.com>", "代わりに 2026-08-25 14:00 を提案します")
    );
    const updated = findSchedulingCase(original.id)!;
    expect(updated.counter_round).toBe(1);
    expect(updated.proposal_revision).toBe(1);
    expect(updated.proposed_slots.map((s) => s.id)).not.toContain("SLOT-001");
    expect(updated.participants.every((p) => p.response === "pending")).toBe(true);
    expect(updated.participants.every((p) => !p.accepted_slot_id)).toBe(true);
    expect(updated.status).toBe("proposing");
  });

  it("asks manual coordination or cancellation at the third counter", async () => {
    const original = upsertSchedulingCase({ ...makeCase(), counter_round: 2 });
    await processScheduleMailEntry(
      triage("MSG-counter-3", original.id, "A <a@example.com>", "別の日 2026-08-25 を提案します")
    );
    const updated = findSchedulingCase(original.id)!;
    expect(updated.exception_reason).toBe("schedule_counter_limit");
    const question = ensureSchedulingCeoConfirmQuestion(updated)!;
    expect(question.fields[0]!.choices).toEqual(["手動調整", "中止"]);
  });

  it("targets overdue reminders once per proposal revision and participant", () => {
    const row = upsertSchedulingCase({
      ...makeCase(),
      reminder_due_at: "2026-01-01T00:00:00.000Z",
    });
    const due = refreshSchedulingReminder(row.id, new Date("2026-01-04T00:00:00.000Z"));
    expect(due.next_action).toBe("send_reminder");
    expect(due.reminder_targets).toEqual(["PART-001", "PART-002"]);

    markSchedulingReminderDrafted(row.id, "PART-001", "DRAFT-1");
    markSchedulingReminderDrafted(row.id, "PART-001", "DRAFT-duplicate");
    const refreshed = refreshSchedulingReminder(row.id, new Date("2026-01-05T00:00:00.000Z"));
    expect(refreshed.reminder_targets).toEqual(["PART-002"]);
    expect(refreshed.reminder_history.filter((r) => r.participant_id === "PART-001")).toHaveLength(1);
  });

  it("does not auto-update when thread matching is ambiguous", async () => {
    upsertSchedulingCase({ ...makeCase("SCH-2026-802"), mail_thread_ids: ["THREAD-shared"] });
    upsertSchedulingCase({ ...makeCase("SCH-2026-803"), mail_thread_ids: ["THREAD-shared"] });
    const entry = upsertTriageEntry({
      ...triage("MSG-ambiguous", "SCH-2026-802"),
      scheduling_case_id: undefined,
      mail_thread_ids: ["THREAD-shared"],
    });
    const result = await processScheduleMailEntry(entry);
    expect(result.action).toBe("unlinked");
    expect(result.reason).toContain("ambiguous");
    expect(findSchedulingCase("SCH-2026-802")!.processed_mail_ids).toEqual([]);
    expect(findSchedulingCase("SCH-2026-803")!.processed_mail_ids).toEqual([]);
  });
});
