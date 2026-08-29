import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { schedulingCaseSchema } from "../schemas/executive/scheduling-cases.js";
import { clearSecretaryDraftToneCacheForTests } from "../src/lib/secretary/tenant-behavior.js";
import { loadCorrespondenceDraft } from "../src/lib/correspondence/draft.js";
import {
  answerCeoInline,
  applyCeoInlineAnswerSideEffects,
  loadCeoInlineQueue,
} from "../src/lib/correspondence/ceo-inline-question.js";
import { saveMailInterpretation } from "../src/lib/correspondence/mail-interpretation.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";
import { seedSchedulingTenant } from "./helpers/scheduling-fixture.js";
import { getDataDir, writeYamlFile } from "../src/lib/utils.js";
import {
  ensureSchedulingCorrespondenceDrafts,
  handleSchedulingCorrespondenceSent,
} from "../src/lib/scheduling-coordination/lifecycle.js";
import { processScheduleMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import {
  findSchedulingCase,
  upsertSchedulingCase,
} from "../src/lib/scheduling-coordination/store.js";

const tenantId = "test-scheduling-secretary-flow";
const tenantRoot = join(getTenantsDir(), tenantId);

function seed(): void {
  seedSchedulingTenant(tenantId);
  writeFileSync(
    join(tenantRoot, "data", "executive", "scheduling-cases.yaml"),
    "version: 1\ncases: []\n"
  );
  writeFileSync(join(tenantRoot, "data", "executive", "calendar.yaml"), "events: []\n");
  writeFileSync(
    join(tenantRoot, "data", "executive", "mail-triage-queue.yaml"),
    "version: 1\nentries: []\n"
  );
  writeFileSync(
    join(tenantRoot, "data", "executive", "mail-interpretation-queue.yaml"),
    "version: 1\nentries: []\n"
  );
  writeFileSync(
    join(tenantRoot, "data", "executive", "ceo-inline-questions.yaml"),
    "version: 1\nquestions: []\n"
  );
  mkdirSync(join(tenantRoot, "rules"), { recursive: true });
  writeFileSync(
    join(tenantRoot, "rules", "secretary_behavior.md"),
    [
      "# Secretary tone (test)",
      "",
      "## 日程調整下書き",
      "",
      "- 候補提示の結び: 何卒よろしくお願い申し上げます。",
      "- リマインドの結び: お手数ですがご回答をお願いいたします。",
      "- 確定通知の結び: 当日は何卒よろしくお願いいたします。",
      "",
    ].join("\n")
  );
  writeYamlFile(join(tenantRoot, "data", "executive", "external-contacts.yaml"), {
    contacts: [
      { id: "EXT-001", name: "Bob", email: "bob@example.com" },
      // Alice is addressed by email rather than contact_ref, but an outbound
      // draft still refuses a recipient the tenant does not know.
      { id: "EXT-002", name: "Alice", email: "alice@example.com" },
    ],
  });
}

function caseRow() {
  const now = new Date().toISOString();
  return schedulingCaseSchema.parse({
    id: "SCH-2026-951",
    title: "個別通知テスト",
    status: "proposing",
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
      {
        id: "PART-002",
        name: "Bob",
        contact_ref: "EXT-001",
        role: "external",
        response: "pending",
      },
      {
        id: "PART-003",
        name: "Internal",
        email: "internal@example.com",
        role: "internal",
        response: "pending",
      },
    ],
    proposed_slots: [{
      id: "SLOT-001",
      start: "2026-08-20T10:00",
      end: "2026-08-20T11:00",
      label: "8月20日 10:00–11:00",
    }],
    meeting_format: "online",
  });
}

describe("scheduling complete secretary flow", () => {
  beforeEach(() => {
    process.env.ORGOS_AUDIT_LOG_DISABLED = "1";
    process.env.ORGOS_AUDIT_BRIDGE_DISABLED = "1";
    clearSecretaryDraftToneCacheForTests();
    seed();
    setTenantId(tenantId);
  });

  afterEach(() => {
    delete process.env.ORGOS_AUDIT_LOG_DISABLED;
    delete process.env.ORGOS_AUDIT_BRIDGE_DISABLED;
    clearSecretaryDraftToneCacheForTests();
    rmSync(tenantRoot, { recursive: true, force: true });
  });

  it("creates one proposal per external participant and resolves contact_ref", () => {
    upsertSchedulingCase(caseRow());
    const updated = ensureSchedulingCorrespondenceDrafts(
      "SCH-2026-951",
      "proposal"
    );
    expect(updated.correspondence).toHaveLength(2);
    expect(updated.participants[1]!.email).toBe("bob@example.com");

    const drafts = updated.correspondence.map((record) =>
      loadCorrespondenceDraft(record.draft_id)
    );
    expect(drafts.map((draft) => draft.to).sort()).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
    expect(drafts.every((draft) => draft.cc?.includes("internal@example.com"))).toBe(true);
    expect(drafts[0]!.body).toContain("様");
    expect(drafts[0]!.body).toContain("形式: オンライン");
    expect(drafts[0]!.body).toContain("何卒よろしくお願い申し上げます。");
  });

  it("blocks all sending when a contact_ref cannot be resolved", () => {
    upsertSchedulingCase({
      ...caseRow(),
      participants: [{
        id: "PART-001",
        name: "Unknown",
        contact_ref: "EXT-999",
        role: "external",
        response: "pending",
      }],
    });
    const updated = ensureSchedulingCorrespondenceDrafts(
      "SCH-2026-951",
      "proposal"
    );
    expect(updated.status).toBe("needs_review");
    expect(updated.exception_reason).toContain("schedule_contact_unresolved");
    expect(updated.correspondence).toEqual([]);
  });

  it("includes the pushed Meet URL and closes only after every confirmation is sent", () => {
    const initial = caseRow();
    writeYamlFile(join(getDataDir(), "executive", "calendar.yaml"), {
      events: [{
        id: "EVT-951",
        title: initial.title,
        type: "meeting",
        start: initial.proposed_slots[0]!.start,
        end: initial.proposed_slots[0]!.end,
        status: "confirmed",
        external_visible: true,
        google_event_id: "google-951",
        meet_url: "https://meet.google.com/abc-defg-hij",
      }],
    });
    upsertSchedulingCase({
      ...initial,
      status: "confirmed",
      calendar_sync: "synced",
      linked_event_id: "EVT-951",
      pending_slot_id: "SLOT-001",
      participants: initial.participants.map((participant) => ({
        ...participant,
        response: "accept" as const,
        accepted_slot_id: "SLOT-001",
      })),
    });

    let updated = ensureSchedulingCorrespondenceDrafts(
      "SCH-2026-951",
      "confirm"
    );
    expect(updated.status).toBe("notifying");
    expect(updated.correspondence).toHaveLength(2);
    const [first, second] = updated.correspondence;
    expect(loadCorrespondenceDraft(first!.draft_id).body).toContain(
      "https://meet.google.com/abc-defg-hij"
    );

    handleSchedulingCorrespondenceSent({
      ...loadCorrespondenceDraft(first!.draft_id),
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_by: "ceo",
    });
    expect(findSchedulingCase(updated.id)?.status).toBe("notifying");

    handleSchedulingCorrespondenceSent({
      ...loadCorrespondenceDraft(second!.draft_id),
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_by: "ceo",
    });
    updated = findSchedulingCase(updated.id)!;
    expect(updated.status).toBe("closed");
    expect(updated.lifecycle_events.map((event) => event.stage)).toContain(
      "notification_sent"
    );
  });

  it("creates a safe non-sendable intake and requires one confirmation", async () => {
    const now = new Date().toISOString();
    const entry = upsertTriageEntry({
      id: "MSG-intake-951",
      received_at: now,
      from: "Bob <bob@example.com>",
      sender_email: "bob@example.com",
      sender_known: true,
      sender_contact_ref: "data/executive/external-contacts.yaml#EXT-001",
      subject: "日程調整のお願い",
      importance: "p2",
      urgency: "none",
      disposition: "ham",
      routing: "secretary",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/missing.eml",
      rule_hits: ["schedule"],
      mail_thread_ids: [],
    });
    saveMailInterpretation({
      mail_id: entry.id,
      interpreted_at: now,
      intent: "schedule",
      action_required: true,
      summary_l1: "日程調整の依頼",
      agreement: 1,
      dissent_notes: [],
      votes: [],
      needs_ceo_confirm: false,
      ceo_questions: [],
    });

    const result = await processScheduleMailEntry(entry);
    expect(result.action).toBe("linked");
    const created = findSchedulingCase(result.case_id!)!;
    expect(created.status).toBe("needs_review");
    expect(created.correspondence).toEqual([]);

    const pending = loadCeoInlineQueue().questions.find(
      (question) => question.mail_id.startsWith("schedule-intake-case:")
    )!;
    const answered = answerCeoInline(
      pending.id,
      { schedule_intake_choice: "続行" },
      "ceo"
    );
    await applyCeoInlineAnswerSideEffects(answered);
    expect(findSchedulingCase(created.id)?.status).toBe("open");
  });
});
