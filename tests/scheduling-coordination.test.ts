import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  loadSchedulingCases,
  upsertSchedulingCase,
  findSchedulingCase,
} from "../src/lib/scheduling-coordination/store.js";
import { proposeExecutiveSlots } from "../src/lib/scheduling-coordination/slots.js";
import { applyNextAction } from "../src/lib/scheduling-coordination/next-action.js";
import { parseScheduleReplyText } from "../src/lib/scheduling-coordination/reply-parse.js";
import { interpretScheduleReply } from "../src/lib/scheduling-coordination/reply-interpret.js";
import { buildSchedulingTodayItem } from "../src/lib/scheduling-coordination/today-summary.js";
import { ensureSchedulingCeoConfirmQuestion } from "../src/lib/scheduling-coordination/ceo-confirm.js";
import {
  createSchedulingCaseFromChat,
  findSchedulingChatDraft,
  handleSchedulingChatMessage,
  isSchedulingChatIntent,
} from "../src/lib/scheduling-coordination/chat-intent.js";
import {
  processScheduleMailEntry,
  linkMailToCase,
} from "../src/lib/scheduling-coordination/process-mail.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import { saveMailInterpretation } from "../src/lib/correspondence/mail-interpretation.js";
import { mailInterpretationResultSchema } from "../schemas/correspondence/mail-interpretation.js";
import { buildTodayContext } from "../src/lib/steward-chat/today-context.js";
import {
  assertSchedulingCaseConfirmable,
  runSchedulingNew,
  runSchedulingPropose,
  runSchedulingRespond,
} from "../src/commands/scheduling-coordination.js";

function seedExecutiveDir(): void {
  const exec = join(getDataDir(), "executive");
  mkdirSync(exec, { recursive: true });
  writeFileSync(join(exec, "scheduling-cases.yaml"), "version: 1\ncases: []\n", "utf-8");
  writeFileSync(join(exec, "calendar.yaml"), "events: []\n", "utf-8");
  writeFileSync(join(exec, "mail-triage-queue.yaml"), "version: 1\nentries: []\n", "utf-8");
  writeFileSync(join(exec, "mail-interpretation-queue.yaml"), "version: 1\nentries: []\n", "utf-8");
  writeFileSync(join(exec, "ceo-inline-questions.yaml"), "version: 1\nquestions: []\n", "utf-8");
  writeFileSync(join(exec, "sender-identification-queue.yaml"), "version: 1\nentries: []\n", "utf-8");
}

function cleanup(): void {
  const exec = join(getDataDir(), "executive");
  if (existsSync(exec)) rmSync(exec, { recursive: true, force: true });
}

describe("schedule_coordination", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seedExecutiveDir();
  });

  afterEach(() => cleanup());

  it("creates case and proposes slots", () => {
    runSchedulingNew({
      title: "役員会",
      participant: ["Alice|alice@example.com|external", "Bob|bob@example.com|internal"],
    });
    const file = loadSchedulingCases();
    expect(file.cases).toHaveLength(1);
    const id = file.cases[0]!.id;
    runSchedulingPropose({ id, count: 2 });
    const updated = findSchedulingCase(id)!;
    expect(updated.proposed_slots.length).toBeGreaterThan(0);
    expect(updated.next_action).toBe("send_proposal");
  });

  it("parses accept reply and updates participant via mail process", async () => {
    const now = new Date().toISOString();
    const caseRow = applyNextAction({
      id: "SCH-2026-001",
      title: "打合せ",
      status: "awaiting_responses",
      created_at: now,
      updated_at: now,
      participants: [
        {
          id: "PART-001",
          name: "Alice",
          email: "alice@example.com",
          role: "external",
          response: "pending",
        },
      ],
      proposed_slots: [
        {
          id: "SLOT-001",
          start: "2026-08-20T14:00",
          end: "2026-08-20T15:00",
          label: "2026-08-20 14:00",
        },
      ],
      duration_minutes: 60,
      mail_thread_ids: [],
      next_action: "send_proposal",
    });
    upsertSchedulingCase(caseRow);

    const entry = upsertTriageEntry({
      id: "MSG-sched-001",
      received_at: now,
      from: "Alice <alice@example.com>",
      subject: "Re: 【日程調整】打合せ — 2026-08-20 で問題ありません",
      importance: "p2",
      urgency: "none",
      disposition: "ham",
      routing: "secretary",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-sched-001.eml",
      rule_hits: [],
      sender_known: true,
      scheduling_case_id: "SCH-2026-001",
    });

    saveMailInterpretation(
      mailInterpretationResultSchema.parse({
        mail_id: entry.id,
        interpreted_at: now,
        intent: "schedule",
        action_required: true,
        summary_l1: "日程 OK",
        agreement: 1,
        dissent_notes: [],
        votes: [],
        needs_ceo_confirm: false,
        ceo_questions: [],
      })
    );

    const result = await processScheduleMailEntry(entry);
    expect(result.action).toBe("updated");
    const after = findSchedulingCase("SCH-2026-001")!;
    expect(after.participants[0]!.response).toBe("accept");
  });

  it("parseScheduleReplyText detects accept with date", () => {
    const parsed = parseScheduleReplyText("2026-08-20 で問題ありません。", [
      {
        id: "SLOT-001",
        start: "2026-08-20T14:00",
        end: "2026-08-20T15:00",
      },
    ]);
    expect(parsed.response).toBe("accept");
    expect(parsed.accepted_slot_ids).toContain("SLOT-001");
  });

  it("records manual response and moves to ceo_confirm when all accept", () => {
    runSchedulingNew({
      title: "4者MTG",
      participant: ["A|a@x.com|external", "B|b@x.com|external"],
    });
    const id = loadSchedulingCases().cases[0]!.id;
    runSchedulingPropose({ id, count: 1 });
    const slotId = findSchedulingCase(id)!.proposed_slots[0]!.id;
    runSchedulingRespond({
      id,
      email: "a@x.com",
      response: "accept",
      slotId,
    });
    runSchedulingRespond({
      id,
      email: "b@x.com",
      response: "accept",
      slotId,
    });
    const after = findSchedulingCase(id)!;
    expect(after.next_action).toBe("ceo_confirm");
  });

  it("linkMailToCase binds triage entry", () => {
    const now = new Date().toISOString();
    upsertSchedulingCase(
      applyNextAction({
        id: "SCH-2026-002",
        title: "会食",
        status: "open",
        created_at: now,
        updated_at: now,
        participants: [{ id: "PART-001", name: "Guest", email: "g@x.com", role: "external", response: "pending" }],
        proposed_slots: [],
        duration_minutes: 60,
        mail_thread_ids: [],
        next_action: "propose_slots",
      })
    );
    upsertTriageEntry({
      id: "MSG-link-001",
      received_at: now,
      from: "Guest <g@x.com>",
      subject: "会食",
      importance: "p2",
      urgency: "none",
      disposition: "ham",
      routing: "secretary",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/MSG-link-001.eml",
      rule_hits: [],
    });
    linkMailToCase("SCH-2026-002", "MSG-link-001");
    const sch = findSchedulingCase("SCH-2026-002")!;
    expect(sch.mail_thread_ids).toContain("MSG-link-001");
  });

  it("hides internal scheduling work from CEO Today", () => {
    const now = new Date().toISOString();
    upsertSchedulingCase(
      applyNextAction({
        id: "SCH-2026-003",
        title: "Today test",
        status: "proposing",
        created_at: now,
        updated_at: now,
        participants: [{ id: "PART-001", name: "X", role: "external", response: "pending" }],
        proposed_slots: [{ id: "SLOT-001", start: "2026-08-21T10:00", end: "2026-08-21T11:00" }],
        duration_minutes: 60,
        mail_thread_ids: [],
        next_action: "send_proposal",
      })
    );
    const ctx = buildTodayContext();
    expect(ctx.scheduling_cases_action_count).toBe(0);
    const row = ctx.scheduling_cases_pending.find((c) => c.id === "SCH-2026-003");
    expect(row).toBeUndefined();
  });

  it("creates ceo_confirm inline question when all accept", () => {
    const now = new Date().toISOString();
    const caseRow = applyNextAction({
      id: "SCH-2026-010",
      title: "確定テスト",
      status: "awaiting_responses",
      created_at: now,
      updated_at: now,
      participants: [
        { id: "PART-001", name: "A", email: "a@x.com", role: "external", response: "accept", accepted_slot_id: "SLOT-001" },
        { id: "PART-002", name: "B", email: "b@x.com", role: "external", response: "accept", accepted_slot_id: "SLOT-001" },
      ],
      proposed_slots: [{ id: "SLOT-001", start: "2026-08-22T10:00", end: "2026-08-22T11:00" }],
      duration_minutes: 60,
      mail_thread_ids: [],
      next_action: "ceo_confirm",
    });
    upsertSchedulingCase(caseRow);
    const q = ensureSchedulingCeoConfirmQuestion(findSchedulingCase("SCH-2026-010")!);
    expect(q?.status).toBe("pending");
    expect(q?.scheduling_case_id).toBe("SCH-2026-010");
  });

  it("interpretScheduleReply keeps regex as an independent vote", () => {
    const now = new Date().toISOString();
    saveMailInterpretation(
      mailInterpretationResultSchema.parse({
        mail_id: "MSG-boost",
        interpreted_at: now,
        intent: "schedule",
        action_required: true,
        summary_l1: "日程 OK 問題ありません",
        agreement: 1,
        dissent_notes: [],
        votes: [],
        needs_ceo_confirm: false,
        ceo_questions: [],
      })
    );
    const parsed = interpretScheduleReply("返信のみ", [], "MSG-boost");
    expect(parsed.response).toBe("unknown");
    expect(parsed.needs_review).toBe(true);
    expect(parsed.dissent).toContain("response vote tie");
  });

  it("collects scheduling chat details within two turns without placeholders", () => {
    expect(isSchedulingChatIntent("4名で役員会の日程調整をお願い")).toBe(true);
    expect(createSchedulingCaseFromChat("4名で役員会の日程調整をお願い")).toBeUndefined();
    expect(loadSchedulingCases().cases).toHaveLength(0);

    const first = handleSchedulingChatMessage(
      "thread-scheduling-two-turn",
      "役員会の日程調整をお願い"
    );
    expect(first.handled).toBe(true);
    expect(first.caseRow).toBeUndefined();
    expect(first.reply).toContain("案件はまだ起票していません");

    const second = handleSchedulingChatMessage(
      "thread-scheduling-two-turn",
      "参加者は Alice <alice@example.com>、Bob <bob@example.com>、60分、オンライン"
    );
    expect(second.caseRow?.source).toBe("chat");
    expect(second.caseRow?.participants.map((participant) => participant.name)).toEqual([
      "Alice",
      "Bob",
    ]);
    expect(second.caseRow?.meeting_format).toBe("online");
    expect(second.caseRow?.duration_minutes).toBe(60);
    expect(findSchedulingChatDraft("thread-scheduling-two-turn")?.status).toBe("completed");
    expect(second.caseRow?.participants.every((participant) => !participant.name.startsWith("参加者"))).toBe(true);
  });

  it("does not duplicate a completed scheduling intent in the same thread", () => {
    const message =
      "「役員会」の日程調整。参加者は Alice <alice@example.com>、Bob <bob@example.com>、60分、オンライン";
    const first = handleSchedulingChatMessage("thread-scheduling-idempotent", message);
    const second = handleSchedulingChatMessage("thread-scheduling-idempotent", message);
    expect(first.caseRow?.id).toBeDefined();
    expect(second.caseRow?.id).toBe(first.caseRow?.id);
    expect(loadSchedulingCases().cases.filter((row) => row.id === first.caseRow?.id)).toHaveLength(1);
  });

  it("buildSchedulingTodayItem uses conclusion-first headline", () => {
    const now = new Date().toISOString();
    const item = buildSchedulingTodayItem({
      id: "SCH-2026-011",
      title: "役員会",
      status: "proposing",
      created_at: now,
      updated_at: now,
      participants: [{ id: "PART-001", name: "A", role: "external", response: "pending" }],
      proposed_slots: [{ id: "SLOT-001", start: "2026-08-23T10:00", end: "2026-08-23T11:00" }],
      duration_minutes: 60,
      mail_thread_ids: [],
      counter_round: 0,
      next_action: "send_proposal",
    });
    expect(item.headline).toContain("要承認");
    expect(item.headline).toContain("役員会");
  });

  it("rejects final confirmation while any participant is unanswered", () => {
    const now = new Date().toISOString();
    const caseRow = applyNextAction({
      id: "SCH-2026-099",
      title: "未回答テスト",
      status: "awaiting_responses",
      created_at: now,
      updated_at: now,
      participants: [
        {
          id: "PART-001",
          name: "Alice",
          email: "alice@example.com",
          role: "external",
          response: "pending",
        },
      ],
      proposed_slots: [
        {
          id: "SLOT-001",
          start: "2026-08-23T10:00",
          end: "2026-08-23T11:00",
        },
      ],
      duration_minutes: 60,
      mail_thread_ids: [],
      next_action: "none",
    });
    expect(() => assertSchedulingCaseConfirmable(caseRow, "SLOT-001")).toThrow(
      /have not answered/
    );
    expect(caseRow.participants[0]!.response).toBe("pending");
  });
});
