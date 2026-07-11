import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { schedulingCaseSchema } from "../schemas/executive/scheduling-cases.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { applyNextAction } from "../src/lib/scheduling-coordination/next-action.js";
import {
  findSchedulingCase,
  SchedulingRevisionConflictError,
  updateSchedulingCase,
  upsertSchedulingCase,
} from "../src/lib/scheduling-coordination/store.js";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import { loadExecutiveCalendar } from "../src/lib/data.js";
import { applyCeoInlineAnswerSideEffects } from "../src/lib/correspondence/ceo-inline-question.js";

const tenantId = "test-scheduling-reliability";
const tenantRoot = join(getTenantsDir(), tenantId);

function executiveDir(): string {
  return join(getDataDir(), "executive");
}

function seedFiles(): void {
  mkdirSync(executiveDir(), { recursive: true });
  writeFileSync(join(executiveDir(), "scheduling-cases.yaml"), "version: 1\ncases: []\n");
  writeFileSync(join(executiveDir(), "calendar.yaml"), "events: []\n");
  writeFileSync(join(executiveDir(), "mail-triage-queue.yaml"), "version: 1\nentries: []\n");
  writeFileSync(join(executiveDir(), "ceo-inline-questions.yaml"), "version: 1\nquestions: []\n");
}

function baseCase() {
  const now = new Date().toISOString();
  return schedulingCaseSchema.parse({
    id: "SCH-2026-901",
    title: "信頼性テスト",
    status: "awaiting_responses",
    created_at: now,
    updated_at: now,
    participants: [
      {
        id: "PART-001",
        name: "Alice",
        email: "alice@example.com",
        response: "accept",
        accepted_slot_id: "SLOT-001",
      },
    ],
    proposed_slots: [
      {
        id: "SLOT-001",
        start: "2026-08-20T14:00",
        end: "2026-08-20T15:00",
      },
    ],
  });
}

describe("scheduling state reliability", () => {
  beforeEach(() => {
    rmSync(tenantRoot, { recursive: true, force: true });
    mkdirSync(tenantRoot, { recursive: true });
    writeFileSync(
      join(tenantRoot, "tenant.yaml"),
      `id: ${tenantId}\nname: Scheduling Reliability Test\nlifecycle: test\n`
    );
    setTenantId(tenantId);
    seedFiles();
    delete process.env.GOOGLE_CALENDAR_ID;
    delete process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    delete process.env.GOOGLE_ACCESS_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(tenantRoot)) rmSync(tenantRoot, { recursive: true, force: true });
  });

  it("keeps next-action pure and moves unanimous cases to awaiting_ceo", () => {
    const queuePath = join(executiveDir(), "ceo-inline-questions.yaml");
    const before = readFileSync(queuePath, "utf-8");
    const result = applyNextAction(baseCase());
    expect(result.next_action).toBe("ceo_confirm");
    expect(result.status).toBe("awaiting_ceo");
    expect(readFileSync(queuePath, "utf-8")).toBe(before);
  });

  it("detects stale scheduling case updates", () => {
    const inserted = upsertSchedulingCase(baseCase());
    updateSchedulingCase(inserted.id, inserted.revision, (current) => ({
      ...current,
      notes: "first",
    }));
    expect(() =>
      updateSchedulingCase(inserted.id, inserted.revision, (current) => ({
        ...current,
        notes: "stale",
      }))
    ).toThrow(SchedulingRevisionConflictError);
  });

  it("rejects upsert when the in-memory revision is stale", () => {
    const inserted = upsertSchedulingCase(baseCase());
    const bumped = updateSchedulingCase(inserted.id, inserted.revision, (current) => ({
      ...current,
      notes: "fresh",
    }));
    expect(() =>
      upsertSchedulingCase({
        ...inserted,
        notes: "stale upsert",
      })
    ).toThrow(SchedulingRevisionConflictError);
    expect(findSchedulingCase(inserted.id)?.notes).toBe("fresh");
    expect(bumped.revision).toBe(inserted.revision + 1);
  });

  it("does not process the same mail twice", async () => {
    const initial = upsertSchedulingCase({
      ...baseCase(),
      status: "awaiting_responses",
      participants: [{ ...baseCase().participants[0]!, response: "pending" }],
    });
    const entry = upsertTriageEntry({
      id: "MSG-reliability-001",
      received_at: new Date().toISOString(),
      from: "Alice <alice@example.com>",
      subject: "日程 2026-08-20 で問題ありません",
      importance: "p2",
      urgency: "none",
      disposition: "ham",
      routing: "secretary",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/missing.eml",
      rule_hits: ["schedule"],
      scheduling_case_id: initial.id,
    });

    expect((await processScheduleMailEntry(entry)).action).toBe("updated");
    expect((await processScheduleMailEntry(entry)).action).toBe("skipped");
    expect(findSchedulingCase(initial.id)?.processed_mail_ids).toEqual([entry.id]);
  });

  it("leaves unknown replies unprocessed and routes the case to review", async () => {
    const initial = upsertSchedulingCase({
      ...baseCase(),
      participants: [{ ...baseCase().participants[0]!, response: "pending" }],
    });
    const entry = upsertTriageEntry({
      id: "MSG-reliability-unknown",
      received_at: new Date().toISOString(),
      from: "Alice <alice@example.com>",
      subject: "日程について確認事項があります",
      importance: "p2",
      urgency: "none",
      disposition: "ham",
      routing: "secretary",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/missing.eml",
      rule_hits: ["schedule"],
      scheduling_case_id: initial.id,
    });

    await processScheduleMailEntry(entry);
    const updated = findSchedulingCase(initial.id)!;
    expect(updated.status).toBe("needs_review");
    expect(updated.processed_mail_ids).not.toContain(entry.id);
    expect((await processScheduleMailEntry(entry)).reason).toBe("awaiting manual review");
  });

  it("falls back to the local calendar without duplicating the event when Google is unset", async () => {
    const initial = upsertSchedulingCase({
      ...applyNextAction(baseCase()),
      pending_slot_id: "SLOT-001",
    });
    const question = {
      id: "CEO-Q-901",
      mail_id: `scheduling:${initial.id}`,
      scheduling_case_id: initial.id,
      subject: "confirm",
      context_l1: "confirm",
      fields: [],
      status: "answered" as const,
      asked_at: new Date().toISOString(),
      answered_at: new Date().toISOString(),
      answers: { schedule_confirm: "はい" },
    };

    await applyCeoInlineAnswerSideEffects(question);
    expect(findSchedulingCase(initial.id)?.calendar_sync).toBe("synced");
    expect(loadExecutiveCalendar().events).toHaveLength(1);

    await applyCeoInlineAnswerSideEffects(question);
    expect(loadExecutiveCalendar().events).toHaveLength(1);
  });

  it("persists Google and Meet ids and makes repeated CEO answers idempotent", async () => {
    process.env.GOOGLE_CALENDAR_ID = "primary";
    process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "google-event-901",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const initial = upsertSchedulingCase({
      ...applyNextAction({ ...baseCase(), meeting_format: "online" }),
      pending_slot_id: "SLOT-001",
    });
    const question = {
      id: "CEO-Q-902",
      mail_id: `scheduling:${initial.id}`,
      scheduling_case_id: initial.id,
      subject: "confirm",
      context_l1: "confirm",
      fields: [],
      status: "answered" as const,
      asked_at: new Date().toISOString(),
      answered_at: new Date().toISOString(),
      answers: { schedule_confirm: "はい" },
    };

    await applyCeoInlineAnswerSideEffects(question);
    await applyCeoInlineAnswerSideEffects(question);

    const event = loadExecutiveCalendar().events[0]!;
    expect(event.google_event_id).toBe("google-event-901");
    expect(event.meet_url).toBe("https://meet.google.com/abc-defg-hij");
    expect(findSchedulingCase(initial.id)?.calendar_sync).toBe("synced");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
