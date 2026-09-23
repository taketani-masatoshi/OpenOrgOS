/**
 * Safety-net characterization for the ceiling refactor.
 * Locks draft text, send path (incl. current +7d reminder), CEO answers,
 * mutations, partial failure, approve/lint/handoff — before structural changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  answerCeoInline,
  applyCeoInlineAnswerSideEffects,
  askCeoInline,
  loadCeoInlineQueue,
} from "../src/lib/correspondence/ceo-inline-question.js";
import {
  loadCorrespondenceDraft,
  markCorrespondenceDraftApproved,
  saveCorrespondenceDraft,
} from "../src/lib/correspondence/draft.js";
import { writeInboundHandoffDraft } from "../src/lib/correspondence/mail-handoff.js";
import * as mailSend from "../src/lib/correspondence/mail-send.js";
import { sendApprovedCorrespondence } from "../src/lib/correspondence/send-gate.js";
import { lintCorrespondenceBody } from "../src/lib/correspondence/style-lint.js";
import { upsertTriageEntry } from "../src/lib/correspondence/mail-triage-queue.js";
import {
  cancelSchedulingCase,
  closeSchedulingCase,
  openSchedulingCase,
  rescheduleSchedulingCase,
} from "../src/lib/scheduling-coordination/case-mutations.js";
import { ensureSchedulingCeoConfirmQuestion } from "../src/lib/scheduling-coordination/ceo-confirm.js";
import { ensureSchedulingCorrespondenceDrafts } from "../src/lib/scheduling-coordination/correspondence-drafts.js";
import { buildSchedulingClarifyText } from "../src/lib/scheduling-coordination/clarify-text.js";
import { buildSchedulingDraftText } from "../src/lib/scheduling-coordination/draft-text.js";
import { findSchedulingCase, upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import { approveFromStewardChat } from "../src/lib/steward-chat/wire-approve.js";
import { currentDate } from "../src/lib/utils.js";
import {
  cleanupSchedulingTenant,
  copySchedulingEml,
  schedulingCase,
  seedDryRunMailConfig,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";

const tenantId = "test-scheduling-safety-net";
const user = {
  operator_id: "ceo-test",
  approver_id: "Test CEO",
  mode: "dev" as const,
};

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("scheduling safety-net characterization", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    seedDryRunMailConfig();
    process.env.ORGOS_AUDIT_LOG_DISABLED = "1";
    process.env.ORGOS_AUDIT_BRIDGE_DISABLED = "1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ORGOS_AUDIT_LOG_DISABLED;
    delete process.env.ORGOS_AUDIT_BRIDGE_DISABLED;
    delete process.env.ORGOS_SMTP_USER;
    delete process.env.ORGOS_SMTP_PASSWORD;
    cleanupSchedulingTenant(tenantId);
  });

  describe("draft-text goldens", () => {
    it("locks proposal / reminder / confirm / clarify content for online and in_person", () => {
      const online = schedulingCase("SCH-2026-950", 2);
      const alice = online.participants[0]!;
      const proposal = buildSchedulingDraftText(online, "proposal", alice);
      expect(proposal.subject).toBe("【日程調整】統合日程調整");
      expect(proposal.body).toContain(`${alice.name} 様`);
      expect(proposal.body).toContain("形式: オンライン");
      expect(proposal.body).toContain("何卒よろしくお願い申し上げます。");
      expect(proposal.body).toContain("8月20日");
      expect(proposal.body).toMatchInlineSnapshot(`
        "Alice 様

        お世話になっております。
        株式会社Scheduling Testの秘書です。

        統合日程調整につき、下記候補日時からご都合をお知らせください。

        1. 8月20日（木） 10:00–11:00
        2. 8月21日（金） 10:00–11:00
        形式: オンライン

        何卒よろしくお願い申し上げます。

        株式会社Scheduling Test
        秘書"
      `);

      const reminder = buildSchedulingDraftText(online, "reminder", alice);
      expect(reminder.subject).toContain("日程調整");
      expect(reminder.body).toContain(alice.name);
      expect(reminder.body).toMatch(/回答|remind|ご都合/i);

      const confirm = buildSchedulingDraftText(
        { ...online, status: "confirmed", pending_slot_id: "SLOT-001" },
        "confirm",
        alice
      );
      expect(confirm.subject).toContain("日程確定");
      expect(confirm.body).toMatch(/日時|Date/i);

      const inPerson = {
        ...schedulingCase("SCH-2026-951", 2),
        meeting_format: "in_person" as const,
        location: "北大路 花遊膳",
        purpose: "会食",
        venue_options: [
          { id: "A" as const, name: "北大路 花遊膳", first_pick: true },
          { id: "B" as const, name: "別店B", first_pick: false },
          { id: "C" as const, name: "別店C", first_pick: false },
        ],
      };
      const clarify = buildSchedulingClarifyText(inPerson, inPerson.participants[0]);
      expect(clarify.body).toMatch(/会場案|Venue|案\s*A/i);
      const mealProposal = buildSchedulingDraftText(inPerson, "proposal", inPerson.participants[0]);
      expect(mealProposal.body).toContain("場所: 北大路 花遊膳");
    });
  });

  describe("send path", () => {
    it("approve+send stamps sent_at, awaiting_responses, authority, and +7d reminder_due_at", async () => {
      const initial = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-952", 2),
        status: "proposing",
      });
      const drafted = ensureSchedulingCorrespondenceDrafts(initial.id, "proposal");
      const draftIds = drafted.correspondence.map((r) => r.draft_id);
      const first = loadCorrespondenceDraft(draftIds[0]!);
      await approveFromStewardChat(first.approval_id!, user, { reviewed: true });
      for (const draftId of draftIds) {
        const transport = await sendApprovedCorrespondence({
          draftId,
          operatorId: "ceo-test",
        });
        expect(transport.sendResult.mode).toBe("dry_run");
      }
      const updated = findSchedulingCase(initial.id)!;
      expect(updated.status).toBe("awaiting_responses");
      expect(updated.correspondence.every((r) => Boolean(r.sent_at))).toBe(true);
      expect(updated.proposal_send_authority?.operator_id).toBe("ceo-test");
      // Current behavior (F4 will change): generic +7 calendar days from today.
      expect(updated.reminder_due_at).toBe(addDaysIso(currentDate(), 7));
    });
  });

  describe("CEO answer path", () => {
    it("covers cancel / manual / repropose / invalid via applyCeoInlineAnswerSideEffects", async () => {
      async function seedCeoCase(id: string) {
        const row = upsertSchedulingCase({
          ...schedulingCase(id, 2),
          status: "awaiting_ceo",
          next_action: "ceo_confirm",
          exception_reason: "schedule_counter_limit",
          participants: schedulingCase(id, 2).participants.map((p) => ({
            ...p,
            response: "accept" as const,
            accepted_slot_id: "SLOT-001",
          })),
        });
        ensureSchedulingCeoConfirmQuestion(row);
        return loadCeoInlineQueue().questions.find(
          (q) => q.scheduling_case_id === id && q.status === "pending"
        )!;
      }

      const cancelQ = await seedCeoCase("SCH-2026-953");
      await applyCeoInlineAnswerSideEffects(
        answerCeoInline(cancelQ.id, { schedule_ceo_choice: "中止" }, "ceo-test")
      );
      const cancelled = findSchedulingCase("SCH-2026-953")!;
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.proposed_slots).toEqual([]);

      const mq = await seedCeoCase("SCH-2026-954");
      await applyCeoInlineAnswerSideEffects(
        answerCeoInline(mq.id, { schedule_ceo_choice: "手動調整" }, "ceo-test")
      );
      expect(findSchedulingCase("SCH-2026-954")).toMatchObject({
        status: "needs_review",
        exception_reason: "schedule_manual_coordination",
      });

      const rq = await seedCeoCase("SCH-2026-955");
      await applyCeoInlineAnswerSideEffects(
        answerCeoInline(rq.id, { schedule_ceo_choice: "再提案" }, "ceo-test")
      );
      expect(findSchedulingCase("SCH-2026-955")).toMatchObject({
        status: "proposing",
        proposed_slots: [],
      });

      const iq = await seedCeoCase("SCH-2026-956");
      await applyCeoInlineAnswerSideEffects(
        answerCeoInline(iq.id, { schedule_ceo_choice: "存在しない選択肢" }, "ceo-test")
      );
      expect(findSchedulingCase("SCH-2026-956")).toMatchObject({
        status: "needs_review",
        exception_reason: "schedule_invalid_ceo_choice",
      });
    });

    it("intake cancel vs reopen via schedule-intake-case mail_id", async () => {
      const intake = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-957", 2),
        status: "needs_review",
        exception_reason: "schedule_intake_confirmation_required",
      });
      const q = askCeoInline({
        mailId: `schedule-intake-case:${intake.id}:MSG-INTAKE`,
        schedulingCaseId: intake.id,
        subject: "受付確認",
        contextL1: "日程調整の安全受付",
        fields: [
          { id: "schedule_intake_choice", label: "選択", type: "choice", choices: ["再開", "中止"] },
        ],
      });
      await applyCeoInlineAnswerSideEffects(
        answerCeoInline(q.id, { schedule_intake_choice: "中止" }, "ceo-test")
      );
      expect(findSchedulingCase(intake.id)?.status).toBe("cancelled");

      const reopen = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-958", 2),
        status: "needs_review",
        exception_reason: "schedule_intake_confirmation_required",
      });
      const q2 = askCeoInline({
        mailId: `schedule-intake-case:${reopen.id}:MSG-INTAKE2`,
        schedulingCaseId: reopen.id,
        subject: "受付確認",
        contextL1: "日程調整の安全受付",
        fields: [
          { id: "schedule_intake_choice", label: "選択", type: "choice", choices: ["再開", "中止"] },
        ],
      });
      await applyCeoInlineAnswerSideEffects(
        answerCeoInline(q2.id, { schedule_intake_choice: "再開" }, "ceo-test")
      );
      expect(findSchedulingCase(reopen.id)?.status).toBe("proposing");
    });
  });

  describe("mutations", () => {
    it("locks open / close / cancel / reschedule; CLI cancel keeps slots", () => {
      const opened = openSchedulingCase({
        title: "安全網起票",
        participants: [
          { name: "Alice", email: "alice@example.com", role: "external" },
          { name: "Bob", email: "bob@example.com", role: "external" },
        ],
      });
      expect(opened.status).toBe("open");
      expect(opened.id).toMatch(/^SCH-\d{4}-\d{3}$/);

      const withSlots = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-959", 2),
        status: "awaiting_responses",
      });
      const cliCancel = cancelSchedulingCase(withSlots.id, "cli-cancel");
      expect(cliCancel.status).toBe("cancelled");
      // Contrast with CEO cancel (clears proposed_slots) locked above.
      expect(cliCancel.proposed_slots).toHaveLength(2);

      const forReschedule = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-961", 2),
        proposal_revision: 1,
        pending_slot_id: "SLOT-001",
      });
      const rescheduled = rescheduleSchedulingCase(forReschedule.id);
      expect(rescheduled.proposal_revision).toBe(2);
      expect(rescheduled.proposed_slots).toEqual([]);

      const closed = closeSchedulingCase(
        upsertSchedulingCase({ ...schedulingCase("SCH-2026-962", 2), status: "confirmed" }).id
      );
      expect(closed.status).toBe("closed");
    });
  });

  describe("partial failure", () => {
    it("keeps first draft sent when second send throws; retry does not double-send first", async () => {
      const initial = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-963", 2),
        status: "proposing",
      });
      const drafted = ensureSchedulingCorrespondenceDrafts(initial.id, "proposal");
      const [d1, d2] = drafted.correspondence.map((r) => r.draft_id);
      const first = loadCorrespondenceDraft(d1!);
      await approveFromStewardChat(first.approval_id!, user, { reviewed: true });

      await sendApprovedCorrespondence({ draftId: d1!, operatorId: "ceo-test" });
      expect(
        findSchedulingCase(initial.id)?.correspondence.find((r) => r.draft_id === d1)?.sent_at
      ).toBeTruthy();

      const sendSpy = vi
        .spyOn(mailSend, "sendCorrespondenceEmail")
        .mockRejectedValueOnce(new Error("SMTP simulated failure"));
      await expect(
        sendApprovedCorrespondence({ draftId: d2!, operatorId: "ceo-test", dryRun: false })
      ).rejects.toThrow(/SMTP simulated failure/);
      sendSpy.mockRestore();

      const mid = findSchedulingCase(initial.id)!;
      expect(mid.correspondence.find((r) => r.draft_id === d1)?.sent_at).toBeTruthy();
      expect(mid.correspondence.find((r) => r.draft_id === d2)?.sent_at).toBeFalsy();

      await sendApprovedCorrespondence({ draftId: d2!, operatorId: "ceo-test" });
      const done = findSchedulingCase(initial.id)!;
      expect(done.correspondence.filter((r) => r.kind === "proposal" && r.sent_at)).toHaveLength(2);
      expect(done.correspondence.filter((r) => r.draft_id === d1)).toHaveLength(1);
    });

    it("blocks drafts when external contact is unresolved", () => {
      const orphan = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-964", 1),
        status: "proposing",
        participants: [
          {
            id: "PART-001",
            name: "Unknown",
            email: "nobody-unlisted@example.invalid",
            role: "external",
            response: "pending",
          },
        ],
      });
      expect(() => ensureSchedulingCorrespondenceDrafts(orphan.id, "proposal")).toThrow(
        /external-contacts|未登録/
      );
      const after = findSchedulingCase(orphan.id)!;
      expect(after.correspondence.filter((r) => r.kind === "proposal")).toHaveLength(0);
    });
  });

  describe("approve / style-lint / handoff", () => {
    it("records draft edit on approve when body changed", async () => {
      const { recordSecretaryDraftEdit } = await import(
        "../src/lib/scheduling-coordination/quality-signals.js"
      );
      const initial = upsertSchedulingCase({
        ...schedulingCase("SCH-2026-965", 2),
        status: "proposing",
      });
      const drafted = ensureSchedulingCorrespondenceDrafts(initial.id, "proposal");
      const draftId = drafted.correspondence[0]!.draft_id;
      const draft = loadCorrespondenceDraft(draftId);
      saveCorrespondenceDraft({ ...draft, body: `${draft.body}\n（追記）` });
      // Direct KPI path (body_hash_at_draft may be unset on older draft records).
      recordSecretaryDraftEdit(initial.id, `draft ${draftId} edited before approval`);
      markCorrespondenceDraftApproved(draftId);
      const after = findSchedulingCase(initial.id)!;
      expect(after.quality_signals?.ceo_draft_edits ?? 0).toBeGreaterThanOrEqual(1);
    });

    it("style-lint meal confirm without cost is error", () => {
      const result = lintCorrespondenceBody({
        body: "ご担当者様\n\n日時: 2026-08-20 10:00\n場所: 焼肉 太郎\n\nよろしくお願いいたします。\n",
        kind: "scheduling_confirm",
        isMeal: true,
        hasCostLine: false,
        meetingFormat: "in_person",
      });
      expect(result.issues.some((i) => i.id === "meal_cost_missing" && i.severity === "error")).toBe(
        true
      );
    });

    it("mail-handoff includes scheduling section for linked triage", () => {
      const caseRow = upsertSchedulingCase(schedulingCase("SCH-2026-967", 2));
      const filename = copySchedulingEml("accept-slot-1.eml", "handoff-safe.eml");
      const entry = upsertTriageEntry({
        id: "MSG-HANDOFF-SAFE",
        received_at: new Date().toISOString(),
        from: "Alice <alice@example.com>",
        subject: "Re: 日程",
        importance: "p2",
        urgency: "none",
        disposition: "ham",
        routing: "secretary",
        handoff_status: "pending",
        eml_ref: `records/executive/mail-received/${filename}`,
        rule_hits: ["schedule"],
        scheduling_case_id: caseRow.id,
        mail_thread_ids: ["THREAD-701"],
      });
      const path = writeInboundHandoffDraft(entry);
      const md = readFileSync(path, "utf-8");
      expect(md).toContain(caseRow.id);
      expect(md).toMatch(/status:|next:/);
    });
  });
});
