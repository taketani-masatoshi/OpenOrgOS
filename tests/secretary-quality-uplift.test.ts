import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupSchedulingTenant,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { buildSchedulingDraftText } from "../src/lib/scheduling-coordination/draft-text.js";
import {
  hasNamedVenue,
  caseNeedsVenueResolution,
} from "../src/lib/scheduling-coordination/venue-gate.js";
import { applyNextAction } from "../src/lib/scheduling-coordination/next-action.js";
import { SCHEDULE_VENUE_PENDING } from "../src/lib/scheduling-coordination/ceo-gates.js";
import { findCaseForMailEntry } from "../src/lib/scheduling-coordination/process-mail.js";
import { schedulingCaseSchema } from "../schemas/executive/scheduling-cases.js";
import { upsertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import { lintCorrespondenceBody } from "../src/lib/correspondence/style-lint.js";
import {
  loadCorrespondenceStyle,
  resolveCorrespondenceLocale,
} from "../src/lib/correspondence/style-resolve.js";
import { writeYamlFile } from "../src/lib/utils.js";
import { join } from "node:path";
import { getDataDir } from "../src/lib/utils.js";
import { writeVenueBookingHandoff } from "../src/lib/scheduling-coordination/venue-handoff.js";
import { existsSync } from "node:fs";
import { getDocsDir } from "../src/lib/utils.js";
import { buildSchedulingClarifyText } from "../src/lib/scheduling-coordination/clarify-text.js";
import {
  recordSecretaryToneCorrection,
  recordSecretaryStyleLintPass,
  recordSecretaryLiveProof,
  secretaryQualityScore,
  isLintCleanClosedCase,
  countConsecutiveLintCleanClosedCases,
  buildSecretaryQualityTodaySummary,
} from "../src/lib/scheduling-coordination/quality-signals.js";
import {
  caseNeedsVenueReservationForConfirm,
  SCHEDULE_VENUE_RESERVATION_PENDING,
} from "../src/lib/scheduling-coordination/venue-gate.js";
import { writeYamlFile as writeYaml } from "../src/lib/utils.js";
import { getVenueReservationsPath } from "../src/lib/venue-booking/paths.js";
import { ensureSchedulingCorrespondenceDrafts } from "../src/lib/scheduling-coordination/lifecycle.js";
import { advanceSchedulingWorkflow } from "../src/lib/scheduling-coordination/workflow.js";
import { findSchedulingCase } from "../src/lib/scheduling-coordination/store.js";
import {
  confirmVenueReservation,
  reserveVenue,
} from "../src/lib/venue-booking/reserve.js";
import { handleSchedulingCorrespondenceSent } from "../src/lib/scheduling-coordination/lifecycle.js";
import {
  hasUnsentSchedulingDraft,
  schedulingCaseNeedsTodayAttention,
} from "../src/lib/scheduling-coordination/today-attention.js";
import { buildSchedulingTodayItem } from "../src/lib/scheduling-coordination/today-summary.js";
import { assertCorrespondenceStyleLint } from "../src/lib/correspondence/style-lint.js";
import { schedulingCaseLooksLikeMeal } from "../src/lib/scheduling-coordination/draft-text.js";
import { buildSchedulingCeoChoices } from "../src/lib/scheduling-coordination/ceo-choice.js";
import {
  hasNamedVenue,
  normalizeVenueName,
  venueNamesMatch,
} from "../src/lib/scheduling-coordination/venue-gate.js";
import { resolveFirstPickId } from "../src/lib/scheduling-coordination/venue-clarify.js";
import { extractCorrespondenceTemplateBody } from "../src/lib/scheduling-coordination/clarify-text.js";

const tenantId = "test-secretary-quality-uplift";

describe("secretary quality uplift P0–P3", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
    writeYamlFile(join(getDataDir(), "executive", "external-contacts.yaml"), {
      contacts: [
        {
          id: "EXT-001",
          name: "Alice US",
          email: "alice@example.com",
          correspondence_locale: "en-US",
        },
        {
          id: "EXT-002",
          name: "竹谷",
          email: "takeya@example.jp",
          correspondence_locale: "ja-JP",
        },
      ],
    });
  });

  afterEach(() => {
    cleanupSchedulingTenant(tenantId);
  });

  it("P0: confirm draft includes addressee, self-intro, datetime, venue", () => {
    const text = buildSchedulingDraftText(
      {
        id: "SCH-2026-801",
        title: "面談",
        status: "confirmed",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "竹谷昌敏",
            email: "takeya@example.jp",
            contact_ref: "EXT-002",
            role: "external",
            response: "accept",
            accepted_slot_id: "SLOT-001",
          },
        ],
        proposed_slots: [
          {
            id: "SLOT-001",
            start: "2026-07-20T12:00",
            end: "2026-07-20T13:30",
            label: "7/20 12:00",
          },
        ],
        duration_minutes: 90,
        meeting_format: "in_person",
        location: "北大路 花遊膳",
        notes: "アクセス: 北大路駅 徒歩5分",
        cost_estimate: "お一人さま税込12,000円前後を目安とし、当方にてご負担いたします",
        ceo_intake_confirmed: true,
        next_action: "send_confirmation",
      },
      "confirm",
      {
        id: "PART-001",
        name: "竹谷昌敏",
        email: "takeya@example.jp",
        contact_ref: "EXT-002",
        role: "external",
        response: "accept",
        accepted_slot_id: "SLOT-001",
      }
    );

    expect(text.body).toMatch(/竹谷昌敏 様/);
    expect(text.body).toMatch(/お世話になっております/);
    expect(text.body).toMatch(/の秘書です/);
    expect(text.body).toMatch(/日時/);
    expect(text.body).toMatch(/7月20日/);
    expect(text.body).toMatch(/北大路 花遊膳/);
    expect(text.body).toMatch(/アクセス/);
    expect(text.body).toMatch(/株式会社.+\n秘書/);
    expect(text.body).toMatch(/^竹谷昌敏 様\n\n/m);
    expect(text.body).not.toMatch(/送信元/);
    expect(text.body).not.toMatch(/予算相談しやすい/);

    const lint = lintCorrespondenceBody({
      body: text.body,
      subject: text.subject,
      kind: "scheduling_confirm",
      meetingFormat: "in_person",
      locale: "ja-JP",
      isMeal: false,
      hasCostLine: true,
    });
    expect(lint.ok).toBe(true);
  });

  it("P0: lint fails on forbidden phrases", () => {
    const lint = lintCorrespondenceBody({
      body: "ご担当者様\n\nグループ会社です。予算相談しやすい店です。\n",
      kind: "scheduling_confirm",
      locale: "ja-JP",
    });
    expect(lint.ok).toBe(false);
    expect(lint.issues.some((i) => i.id === "forbidden_phrase")).toBe(true);
  });

  it("P1: links known EXT contact with single active case", () => {
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-810",
        title: "面談",
        status: "awaiting_responses",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "竹谷",
            email: "takeya@example.jp",
            contact_ref: "EXT-002",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [
          { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
        ],
        duration_minutes: 60,
        mail_thread_ids: ["MSG-OUT-001"],
        processed_mail_ids: [],
        ceo_intake_confirmed: true,
        next_action: "none",
      })
    );

    const matched = findCaseForMailEntry({
      id: "MSG-IN-002",
      received_at: "2026-07-12T01:00:00.000Z",
      from: "竹谷 <takeya@example.jp>",
      subject: "Re: 【日程調整】面談",
      importance: "p2",
      urgency: "none",
      disposition: "ham",
      routing: "secretary",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/x.eml",
      rule_hits: ["schedule"],
      sender_email: "takeya@example.jp",
      sender_known: true,
      sender_contact_ref: "EXT-002",
      mail_thread_ids: [],
      references: [],
      in_reply_to: "MSG-OUT-001",
    });
    expect(matched?.id).toBe("SCH-2026-810");
  });

  it("P2: venue pending when in_person confirm lacks named venue", () => {
    expect(hasNamedVenue("京都周辺")).toBe(false);
    expect(hasNamedVenue("北大路 花遊膳")).toBe(true);

    const row = applyNextAction({
      id: "SCH-2026-820",
      title: "会食",
      status: "confirmed",
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      participants: [
        {
          id: "PART-001",
          name: "A",
          email: "a@example.com",
          role: "external",
          response: "accept",
          accepted_slot_id: "SLOT-001",
        },
      ],
      proposed_slots: [
        { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
      ],
      duration_minutes: 60,
      meeting_format: "in_person",
      location: "京都周辺",
      calendar_sync: "synced",
      ceo_intake_confirmed: true,
      next_action: "send_confirmation",
    });
    expect(row.exception_reason).toBe(SCHEDULE_VENUE_PENDING);
    expect(row.next_action).toBe("ceo_confirm");
    expect(caseNeedsVenueResolution(row)).toBe(true);

    const path = writeVenueBookingHandoff(row);
    expect(existsSync(path)).toBe(true);
    expect(path).toContain(join(getDocsDir(), "reports", "routing-queue"));
  });

  it("P3: contact correspondence_locale selects en-US pack", () => {
    expect(resolveCorrespondenceLocale({ contactRef: "EXT-001" })).toBe("en-US");
    const style = loadCorrespondenceStyle("en-US");
    expect(style.locale).toBe("en-US");
    expect(style.opener?.reply_thanks).toMatch(/Thank you/i);

    const text = buildSchedulingDraftText(
      {
        id: "SCH-2026-830",
        title: "Intro meeting",
        status: "proposing",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "Alice US",
            email: "alice@example.com",
            contact_ref: "EXT-001",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [
          { id: "SLOT-001", start: "2026-08-01T10:00", end: "2026-08-01T11:00", label: "Aug 1" },
        ],
        duration_minutes: 60,
        meeting_format: "online",
        ceo_intake_confirmed: true,
        next_action: "send_proposal",
      },
      "proposal",
      {
        id: "PART-001",
        name: "Alice US",
        email: "alice@example.com",
        contact_ref: "EXT-001",
        role: "external",
        response: "pending",
      }
    );
    expect(text.subject).toMatch(/\[Scheduling\]/);
    expect(text.body).toMatch(/Dear Alice US/);
    expect(text.body).toMatch(/on behalf of/i);
  });

  it("P2: venue pending blocks proposal send for in_person without named venue", () => {
    const row = applyNextAction({
      id: "SCH-2026-821",
      title: "会食",
      status: "proposing",
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      participants: [
        {
          id: "PART-001",
          name: "A",
          email: "a@example.com",
          role: "external",
          response: "pending",
        },
      ],
      proposed_slots: [
        { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
      ],
      duration_minutes: 60,
      meeting_format: "in_person",
      location: "銀座周辺",
      ceo_intake_confirmed: true,
      purpose: "近況共有",
      next_action: "send_proposal",
    });
    expect(row.exception_reason).toBe(SCHEDULE_VENUE_PENDING);
    expect(row.next_action).toBe("ceo_confirm");
    expect(row.status).toBe("awaiting_ceo");
  });

  it("P1: skips own outbound schedule mail for safe intake matching", () => {
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-811",
        title: "役員打合せ",
        status: "awaiting_responses",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "外部",
            email: "ext@partner.example",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [
          { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
        ],
        duration_minutes: 60,
        mail_thread_ids: ["MSG-OUT-OWN"],
        processed_mail_ids: [],
        ceo_intake_confirmed: true,
        next_action: "none",
      })
    );

    const matched = findCaseForMailEntry({
      id: "MSG-OWN-COPY",
      received_at: "2026-07-12T01:00:00.000Z",
      from: "CEO <ceo@scheduling.test>",
      subject: "【日程調整】役員打合せ",
      importance: "p2",
      urgency: "none",
      disposition: "ham",
      routing: "secretary",
      handoff_status: "pending",
      eml_ref: "records/executive/mail-received/own.eml",
      rule_hits: ["schedule"],
      sender_email: "ceo@scheduling.test",
      sender_known: true,
      mail_thread_ids: [],
      references: [],
    });
    expect(matched?.id).toBe("SCH-2026-811");
  });

  it("P2: meal without cost errors on proposal", () => {
    const lint = lintCorrespondenceBody({
      body:
        "ご担当者様\n\nお世話になっております。\n株式会社MALの秘書です。\n\n・日時: 7月20日（月）12:00\n・会場: 花遊膳\n\n何卒よろしくお願い申し上げます。\n\n株式会社MAL\n秘書\n",
      kind: "scheduling_proposal",
      locale: "ja-JP",
      isMeal: true,
      hasCostLine: false,
    });
    expect(lint.ok).toBe(false);
    expect(lint.issues.some((i) => i.id === "meal_cost_missing" && i.severity === "error")).toBe(
      true
    );
  });
});

describe("secretary quality uplift P5–P7", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
  });

  afterEach(() => {
    cleanupSchedulingTenant(tenantId);
  });

  it("P5: clarify text has venue options only (no datetime, no allergy)", () => {
    const text = buildSchedulingClarifyText(
      {
        id: "SCH-2026-901",
        title: "会食",
        status: "proposing",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "竹谷",
            email: "takeya@example.jp",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [],
        duration_minutes: 90,
        meeting_format: "in_person",
        purpose: "近況共有",
        venue_options: [
          { id: "A", name: "花遊膳", facts: "個室あり", first_pick: true },
          { id: "B", name: "吉兆", facts: "懐石" },
          { id: "C", name: "瓢亭", facts: "すっぽん" },
        ],
        ceo_intake_confirmed: true,
        next_action: "send_clarify",
      },
      {
        id: "PART-001",
        name: "竹谷",
        email: "takeya@example.jp",
        role: "external",
        response: "pending",
      }
    );
    expect(text.body).toMatch(/【会場案】|Venue options/i);
    expect(text.body).toMatch(/花遊膳/);
    expect(text.body).not.toMatch(/・日時\s*[:：]|日時\s*[:：]\s*\S/);
    expect(text.body).not.toMatch(/アレルギー/);
    expect(text.body).toMatch(/日程のご提案は改めて|会場案をご検討/);

    const lint = lintCorrespondenceBody({
      body: text.body,
      subject: text.subject,
      kind: "scheduling_clarify",
      locale: "ja-JP",
    });
    expect(lint.ok).toBe(true);
  });

  it("P5: in_person with venue options routes to send_clarify before proposal", () => {
    const row = applyNextAction({
      id: "SCH-2026-902",
      title: "会食",
      status: "open",
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      participants: [
        {
          id: "PART-001",
          name: "A",
          email: "a@example.com",
          role: "external",
          response: "pending",
        },
      ],
      proposed_slots: [
        { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
      ],
      duration_minutes: 60,
      meeting_format: "in_person",
      location: "花遊膳",
      venue_options: [
        { id: "A", name: "花遊膳", first_pick: true },
        { id: "B", name: "吉兆" },
        { id: "C", name: "瓢亭" },
      ],
      ceo_intake_confirmed: true,
      next_action: "propose_slots",
    });
    expect(row.next_action).toBe("send_clarify");
  });

  it("P6: tone correction KPI is separate from venue booking", () => {
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-903",
        title: "面談",
        status: "closed",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "A",
            email: "a@example.com",
            role: "external",
            response: "accept",
          },
        ],
        proposed_slots: [
          { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
        ],
        duration_minutes: 60,
        meeting_format: "online",
        ceo_intake_confirmed: true,
        next_action: "none",
      })
    );
    const updated = recordSecretaryToneCorrection(
      "SCH-2026-903",
      "「予算相談しやすい」は使わない"
    );
    expect(updated.quality_signals?.ceo_tone_corrections).toBe(1);
    expect(secretaryQualityScore(updated)).toBe(1);
  });

  it("P7: confirm draft includes external_ref when VR confirmed", () => {
    writeYaml(getVenueReservationsPath(), {
      version: 1,
      channel: "venue_booking",
      reservations: [
        {
          id: "VR-2026-001",
          status: "confirmed",
          provider_id: "hotpepper_deep_link",
          venue_name: "花遊膳",
          area: "京都",
          party_size: 4,
          start_at: "2026-07-20T12:00:00+09:00",
          end_at: "2026-07-20T13:30:00+09:00",
          scheduling_case_id: "SCH-2026-904",
          request_id: "SCH-2026-904-hp-1",
          external_ref: "HP-12345",
          created_at: "2026-07-12T00:00:00.000Z",
          updated_at: "2026-07-12T00:00:00.000Z",
        },
      ],
    });

    const caseRow = schedulingCaseSchema.parse({
      id: "SCH-2026-904",
      title: "会食",
      status: "confirmed",
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      participants: [
        {
          id: "PART-001",
          name: "竹谷",
          email: "takeya@example.jp",
          role: "external",
          response: "accept",
          accepted_slot_id: "SLOT-001",
        },
      ],
      proposed_slots: [
        {
          id: "SLOT-001",
          start: "2026-07-20T12:00",
          end: "2026-07-20T13:30",
          label: "7/20 12:00",
        },
      ],
      duration_minutes: 90,
      meeting_format: "in_person",
      location: "花遊膳",
      venue_reservation_id: "VR-2026-001",
      calendar_sync: "synced",
      ceo_intake_confirmed: true,
      next_action: "send_confirmation",
    });

    expect(caseNeedsVenueReservationForConfirm(caseRow)).toBe(false);

    const text = buildSchedulingDraftText(caseRow, "confirm", caseRow.participants[0]!);
    expect(text.body).toMatch(/ご予約番号: HP-12345/);
  });

  it("P7: blocks confirm when VR external_ref missing", () => {
    const row = applyNextAction({
      id: "SCH-2026-905",
      title: "会食",
      status: "confirmed",
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      participants: [
        {
          id: "PART-001",
          name: "A",
          email: "a@example.com",
          role: "external",
          response: "accept",
          accepted_slot_id: "SLOT-001",
        },
      ],
      proposed_slots: [
        { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
      ],
      duration_minutes: 60,
      meeting_format: "in_person",
      location: "花遊膳",
      calendar_sync: "synced",
      ceo_intake_confirmed: true,
      next_action: "send_confirmation",
    });
    expect(caseNeedsVenueReservationForConfirm(row)).toBe(true);
    expect(row.exception_reason).toBe(SCHEDULE_VENUE_RESERVATION_PENDING);
    expect(row.next_action).toBe("none");
  });

  it("P5: workflow auto-drafts clarify when send_clarify", () => {
    writeYamlFile(join(getDataDir(), "executive", "external-contacts.yaml"), {
      contacts: [
        {
          id: "EXT-902",
          name: "竹谷",
          email: "takeya@example.jp",
          correspondence_locale: "ja-JP",
        },
      ],
    });
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-910",
        title: "会食",
        status: "open",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "竹谷",
            email: "takeya@example.jp",
            contact_ref: "EXT-902",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [],
        duration_minutes: 90,
        meeting_format: "in_person",
        purpose: "近況共有",
        location: "花遊膳",
        venue_options: [
          { id: "A", name: "花遊膳", facts: "個室あり", first_pick: true },
          { id: "B", name: "吉兆", facts: "懐石" },
          { id: "C", name: "瓢亭", facts: "すっぽん" },
        ],
        ceo_intake_confirmed: true,
        next_action: "send_clarify",
      })
    );

    const advanced = advanceSchedulingWorkflow("SCH-2026-910");
    expect(advanced.correspondence.some((r) => r.kind === "clarify")).toBe(true);
    expect(advanced.next_action === "send_clarify" || advanced.next_action === "none").toBe(true);
  });

  it("P7: VR confirm clears reservation gate and unlocks confirmation", async () => {
    writeYamlFile(join(getDataDir(), "executive", "external-contacts.yaml"), {
      contacts: [
        {
          id: "EXT-904",
          name: "竹谷",
          email: "takeya@example.jp",
        },
      ],
    });
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-920",
        title: "会食",
        status: "confirmed",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "竹谷",
            email: "takeya@example.jp",
            contact_ref: "EXT-904",
            role: "external",
            response: "accept",
            accepted_slot_id: "SLOT-001",
          },
        ],
        proposed_slots: [
          {
            id: "SLOT-001",
            start: "2026-07-20T12:00",
            end: "2026-07-20T13:30",
            label: "7/20 12:00",
          },
        ],
        duration_minutes: 90,
        meeting_format: "in_person",
        location: "花遊膳",
        notes: "アクセス: 四条駅 徒歩5分",
        cost_estimate: "お一人さま税込12,000円前後を目安とし、当方にてご負担いたします",
        calendar_sync: "synced",
        ceo_intake_confirmed: true,
        exception_reason: SCHEDULE_VENUE_RESERVATION_PENDING,
        next_action: "none",
      })
    );

    const { reservation } = await reserveVenue({
      venueName: "花遊膳",
      area: "京都",
      providerId: "hotpepper_deep_link",
      partySize: 4,
      startAt: "2026-07-20T12:00",
      endAt: "2026-07-20T13:30",
      schedulingCaseId: "SCH-2026-920",
      requestId: "SCH-2026-920-hp-1",
    });
    await confirmVenueReservation({
      id: reservation.id,
      externalRef: "HP-7788",
      allowUnapproved: true,
    });

    const latest = findSchedulingCase("SCH-2026-920")!;
    expect(latest.venue_reservation_id).toBe(reservation.id);
    expect(latest.exception_reason).not.toBe(SCHEDULE_VENUE_RESERVATION_PENDING);
    expect(latest.next_action).toBe("send_confirmation");
    expect(latest.correspondence.some((r) => r.kind === "confirm")).toBe(true);
  });

  it("B1: clarify send auto-proposes slots onto case", () => {
    writeYamlFile(join(getDataDir(), "executive", "external-contacts.yaml"), {
      contacts: [
        {
          id: "EXT-930",
          name: "竹谷",
          email: "takeya@example.jp",
        },
      ],
    });
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-930",
        title: "会食",
        status: "proposing",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "竹谷",
            email: "takeya@example.jp",
            contact_ref: "EXT-930",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [],
        duration_minutes: 90,
        meeting_format: "in_person",
        purpose: "近況共有",
        location: "花遊膳",
        cost_estimate: "お一人さま税込12,000円前後を目安とし、当方にてご負担いたします",
        venue_options: [
          { id: "A", name: "花遊膳", facts: "個室あり", first_pick: true },
          { id: "B", name: "吉兆" },
          { id: "C", name: "瓢亭" },
        ],
        ceo_intake_confirmed: true,
        correspondence: [
          {
            kind: "clarify",
            participant_id: "PART-001",
            draft_id: "DFT-CLARIFY-930",
            proposal_revision: 0,
            drafted_at: "2026-07-12T00:30:00.000Z",
          },
        ],
        next_action: "none",
      })
    );

    const updated = handleSchedulingCorrespondenceSent({
      draft_id: "DFT-CLARIFY-930",
      channel: "email",
      status: "sent",
      body: "x",
      subject: "y",
      to: "takeya@example.jp",
      created_by: "test",
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      sent_at: "2026-07-12T01:00:00.000Z",
      notes: "scheduling-case:SCH-2026-930 kind:clarify participant:PART-001 revision:0",
    });

    expect(updated?.proposed_slots.length).toBeGreaterThan(0);
    expect(
      updated?.next_action === "send_proposal" ||
        updated?.correspondence.some((r) => r.kind === "proposal")
    ).toBe(true);
  });

  it("O1: VR pending and unsent drafts need Today attention", () => {
    const vrPending = schedulingCaseSchema.parse({
      id: "SCH-2026-940",
      title: "会食",
      status: "confirmed",
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      participants: [
        {
          id: "PART-001",
          name: "A",
          email: "a@example.com",
          role: "external",
          response: "accept",
        },
      ],
      proposed_slots: [
        { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
      ],
      duration_minutes: 60,
      meeting_format: "in_person",
      location: "花遊膳",
      calendar_sync: "synced",
      ceo_intake_confirmed: true,
      exception_reason: SCHEDULE_VENUE_RESERVATION_PENDING,
      next_action: "none",
    });
    expect(schedulingCaseNeedsTodayAttention(vrPending)).toBe(true);
    expect(buildSchedulingTodayItem(vrPending).visible_to_ceo).toBe(true);
    expect(buildSchedulingTodayItem(vrPending).headline).toMatch(/予約番号待ち/);

    const unsent = schedulingCaseSchema.parse({
      id: "SCH-2026-941",
      title: "会食",
      status: "proposing",
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      participants: [
        {
          id: "PART-001",
          name: "A",
          email: "a@example.com",
          role: "external",
          response: "pending",
        },
      ],
      proposed_slots: [],
      duration_minutes: 60,
      meeting_format: "in_person",
      venue_options: [
        { id: "A", name: "花遊膳", first_pick: true },
        { id: "B", name: "吉兆" },
        { id: "C", name: "瓢亭" },
      ],
      ceo_intake_confirmed: true,
      correspondence: [
        {
          kind: "clarify",
          participant_id: "PART-001",
          draft_id: "DFT-941",
          proposal_revision: 0,
          drafted_at: "2026-07-12T00:30:00.000Z",
        },
      ],
      next_action: "none",
    });
    expect(hasUnsentSchedulingDraft(unsent)).toBe(true);
    expect(schedulingCaseNeedsTodayAttention(unsent)).toBe(true);
    expect(buildSchedulingTodayItem(unsent).visible_to_ceo).toBe(true);
  });

  it("L1: meal cost ERROR blocks send-style lint for proposal/confirm", () => {
    expect(
      schedulingCaseLooksLikeMeal({
        title: "会食",
        purpose: "近況共有",
        meeting_format: "in_person",
      })
    ).toBe(true);
    expect(() =>
      assertCorrespondenceStyleLint(
        {
          body:
            "ご担当者様\n\nお世話になっております。\n株式会社MALの秘書です。\n\n何卒よろしくお願い申し上げます。\n\n株式会社MAL\n秘書\n",
          subject: "会食",
          notes: "kind:proposal",
        },
        {
          meetingFormat: "in_person",
          isMeal: true,
          hasCostLine: false,
        }
      )
    ).toThrow(/meal|費用|style lint/i);
  });

  it("guardrail: confirm requires ja datetime, access, 2-line signature", () => {
    const weak = lintCorrespondenceBody({
      body: [
        "竹谷昌敏 様",
        "お世話になっております。",
        "株式会社MALの秘書です。",
        "ご返信ありがとうございました。",
        "ご希望どおり、下記にて確定いたしました。",
        "・日時: 2026-07-15 18:00–19:00",
        "・会場: なだ万 パレスホテル東京",
        "当日は何卒よろしくお願い申し上げます。",
        "株式会社MAL 秘書",
      ].join("\n"),
      kind: "scheduling_confirm",
      locale: "ja-JP",
      meetingFormat: "in_person",
      isMeal: true,
      hasCostLine: false,
    });
    expect(weak.ok).toBe(false);
    const ids = weak.issues.filter((i) => i.severity === "error").map((i) => i.id);
    expect(ids).toContain("missing_blank_after_addressee");
    expect(ids).toContain("datetime_not_localized");
    expect(ids).toContain("missing_access");
    expect(ids).toContain("signature_not_block");
    expect(ids).toContain("meal_cost_missing");

    const strong = lintCorrespondenceBody({
      body: [
        "竹谷昌敏 様",
        "",
        "お世話になっております。",
        "株式会社MALの秘書です。",
        "",
        "ご返信ありがとうございました。",
        "ご希望どおり、下記にて確定いたしました。",
        "",
        "・日時: 7月15日（水）18:00–19:00",
        "・会場: なだ万 パレスホテル東京",
        "・アクセス: 東京駅 徒歩約5分",
        "・費用: お一人さま税込18,000円前後を目安とし、当方にてご負担いたします",
        "",
        "当日は何卒よろしくお願い申し上げます。",
        "",
        "株式会社MAL",
        "秘書",
      ].join("\n"),
      kind: "scheduling_confirm",
      locale: "ja-JP",
      meetingFormat: "in_person",
      isMeal: true,
      hasCostLine: true,
    });
    expect(strong.ok).toBe(true);
  });

  it("P0: LIVE-MEASURE in body is style-lint ERROR", () => {
    const lint = lintCorrespondenceBody({
      body: [
        "竹谷昌敏 様",
        "",
        "お世話になっております。",
        "株式会社MALの秘書です。",
        "",
        "ご返信ありがとうございました。",
        "ご希望どおり、下記にて確定いたしました。",
        "",
        "・日時: 7月15日（水） 18:00–19:00",
        "・会場: なだ万 パレスホテル東京",
        "・アクセス: 東京駅 徒歩5分",
        "・費用: お一人さま税込18,000円前後を目安とし、当方にてご負担いたします",
        "・ご予約番号: LIVE-MEASURE-20260714-SCH021",
        "",
        "当日は何卒よろしくお願い申し上げます。",
        "",
        "株式会社MAL",
        "秘書",
      ].join("\n"),
      kind: "scheduling_confirm",
      locale: "ja-JP",
      meetingFormat: "in_person",
      isMeal: true,
      hasCostLine: true,
    });
    expect(lint.ok).toBe(false);
    expect(
      lint.issues.some((i) => i.id === "measurement_placeholder" && i.severity === "error")
    ).toBe(true);
  });

  it("P0: HP-PROOF in body is style-lint ERROR", () => {
    const lint = lintCorrespondenceBody({
      body: [
        "検証相手 様",
        "",
        "お世話になっております。",
        "株式会社MALの秘書です。",
        "",
        "ご希望どおり、下記にて確定いたしました。",
        "",
        "・日時: 7月20日（月） 18:00–19:00",
        "・会場: なだ万 パレスホテル東京",
        "・アクセス: 東京駅 徒歩5分",
        "・費用: お一人さま税込12,000円前後を目安とし、当方にてご負担いたします",
        "・ご予約番号: HP-PROOF-20260714-022",
        "",
        "当日は何卒よろしくお願い申し上げます。",
        "",
        "株式会社MAL",
        "秘書",
      ].join("\n"),
      kind: "scheduling_confirm",
      locale: "ja-JP",
      meetingFormat: "in_person",
      isMeal: true,
      hasCostLine: true,
    });
    expect(lint.ok).toBe(false);
    expect(lint.issues.some((i) => i.id === "measurement_placeholder")).toBe(true);
  });

  it("P0: style-lint pass is recorded on quality_signals", () => {
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-960",
        title: "打合せ",
        status: "proposing",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "A",
            email: "a@example.com",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [],
        duration_minutes: 60,
        meeting_format: "online",
        ceo_intake_confirmed: true,
        next_action: "none",
      })
    );
    recordSecretaryStyleLintPass("SCH-2026-960", { draftId: "DFT-960", warningCount: 1 });
    const row = findSchedulingCase("SCH-2026-960")!;
    expect(row.quality_signals?.style_lint_pass_count).toBe(1);
    expect(row.quality_signals?.last_style_lint_warnings).toBe(1);
    expect(row.quality_signals?.notes.some((n) => n.includes("[lint] DFT-960 PASS"))).toBe(true);
  });

  it("P6: consecutive lint-clean closed streak + live_proof metadata", () => {
    const base = {
      participants: [
        {
          id: "PART-001",
          name: "A",
          email: "a@example.com",
          role: "external" as const,
          response: "accept" as const,
        },
      ],
      proposed_slots: [] as [],
      duration_minutes: 60,
      meeting_format: "online" as const,
      ceo_intake_confirmed: true,
      next_action: "none" as const,
    };
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-971",
        title: "旧FAIL相当",
        status: "closed",
        created_at: "2026-07-10T00:00:00.000Z",
        updated_at: "2026-07-10T12:00:00.000Z",
        quality_signals: {
          ceo_draft_edits: 0,
          ceo_tone_corrections: 0,
          style_lint_pass_count: 0,
          notes: [],
        },
        ...base,
      })
    );
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-972",
        title: "lint clean",
        status: "closed",
        created_at: "2026-07-14T00:00:00.000Z",
        updated_at: "2026-07-14T12:00:00.000Z",
        quality_signals: {
          ceo_draft_edits: 0,
          ceo_tone_corrections: 0,
          style_lint_pass_count: 3,
          last_style_lint_warnings: 0,
          notes: [],
        },
        ...base,
      })
    );
    expect(isLintCleanClosedCase(findSchedulingCase("SCH-2026-972")!)).toBe(true);
    expect(isLintCleanClosedCase(findSchedulingCase("SCH-2026-971")!)).toBe(false);
    const streak = countConsecutiveLintCleanClosedCases();
    expect(streak.count).toBe(1);
    expect(streak.caseIds[0]).toBe("SCH-2026-972");

    recordSecretaryLiveProof("SCH-2026-972", {
      partner: "self",
      accept_path: "inject",
      venue_ref_kind: "measurement",
      note: "fixture",
    });
    expect(findSchedulingCase("SCH-2026-972")!.quality_signals?.live_proof?.partner).toBe("self");

    const today = buildSecretaryQualityTodaySummary();
    expect(today?.detail).toMatch(/連続 lint-clean 1/);
  });

  it("P1: clarify area does not use venue shop name as area", () => {
    const text = buildSchedulingClarifyText(
      schedulingCaseSchema.parse({
        id: "SCH-2026-961",
        title: "会食",
        status: "open",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "竹谷",
            email: "takeya@example.jp",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [],
        duration_minutes: 90,
        meeting_format: "in_person",
        purpose: "近況共有",
        location: "花遊膳",
        venue_options: [
          { id: "A", name: "花遊膳", facts: "四条駅 徒歩5分 · 個室あり", first_pick: true },
          { id: "B", name: "吉兆", facts: "懐石" },
          { id: "C", name: "瓢亭", facts: "すっぽん" },
        ],
        ceo_intake_confirmed: true,
        next_action: "send_clarify",
      }),
      {
        id: "PART-001",
        name: "竹谷",
        email: "takeya@example.jp",
        role: "external",
        response: "pending",
      }
    );
    expect(text.body).not.toMatch(/・エリア:\s*花遊膳/);
    expect(text.body).toMatch(/四条駅周辺|【会場案】/);
  });

  it("P1: meal proposal/confirm drafts require cost_estimate before create", () => {
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2026-962",
        title: "会食",
        status: "proposing",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        participants: [
          {
            id: "PART-001",
            name: "竹谷",
            email: "takeya@example.jp",
            contact_ref: "EXT-962",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [
          { id: "SLOT-001", start: "2026-07-20T18:00", end: "2026-07-20T19:00" },
        ],
        duration_minutes: 60,
        meeting_format: "in_person",
        purpose: "近況共有",
        location: "花遊膳",
        notes: "アクセス: 四条駅 徒歩5分",
        ceo_intake_confirmed: true,
        next_action: "send_proposal",
      })
    );
    writeYamlFile(join(getDataDir(), "executive", "external-contacts.yaml"), {
      contacts: [
        {
          id: "EXT-962",
          name: "竹谷",
          email: "takeya@example.jp",
        },
      ],
    });
    expect(() => ensureSchedulingCorrespondenceDrafts("SCH-2026-962", "proposal")).toThrow(
      /cost_estimate|費用/
    );
  });

  it("C-U1: CEO venue form labels differ for clarify vs pending", () => {
    const base = {
      id: "SCH-2026-950",
      title: "会食",
      status: "awaiting_ceo" as const,
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      participants: [
        {
          id: "PART-001",
          name: "A",
          email: "a@example.com",
          role: "external" as const,
          response: "pending" as const,
        },
      ],
      proposed_slots: [],
      duration_minutes: 60,
      meeting_format: "in_person" as const,
      ceo_intake_confirmed: true,
      next_action: "ceo_confirm" as const,
    };
    const clarify = buildSchedulingCeoChoices(
      schedulingCaseSchema.parse({
        ...base,
        exception_reason: "schedule_venue_clarify",
      })
    );
    const pending = buildSchedulingCeoChoices(
      schedulingCaseSchema.parse({
        ...base,
        id: "SCH-2026-951",
        proposed_slots: [
          { id: "SLOT-001", start: "2026-07-20T12:00", end: "2026-07-20T13:00" },
        ],
        exception_reason: "schedule_venue_pending",
      })
    );
    expect(clarify.label).toMatch(/候補日前/);
    expect(pending.label).toMatch(/提案\/確定前|追って連絡/);
    expect(clarify.label).not.toBe(pending.label);
  });

  it("C-U2: venue name matching and hasNamedVenue hardening", () => {
    expect(hasNamedVenue("京都周辺")).toBe(false);
    expect(hasNamedVenue("Ginza area")).toBe(false);
    expect(hasNamedVenue("北大路 花遊膳")).toBe(true);
    expect(hasNamedVenue("Sushi Saito")).toBe(true);
    expect(normalizeVenueName("北大路　花遊膳（個室）")).toBe("北大路花遊膳");
    expect(venueNamesMatch("花遊膳", "北大路 花遊膳")).toBe(true);
    expect(venueNamesMatch("吉兆", "瓢亭")).toBe(false);

    expect(
      resolveFirstPickId("北大路 花遊膳", [
        { id: "A", name: "花遊膳", raw: "花遊膳 — 個室あり" },
        { id: "B", name: "吉兆", raw: "吉兆" },
        { id: "C", name: "瓢亭", raw: "瓢亭" },
      ])
    ).toBe("A");
    expect(
      resolveFirstPickId("B", [
        { id: "A", name: "花遊膳", raw: "花遊膳" },
        { id: "B", name: "吉兆", raw: "吉兆" },
        { id: "C", name: "瓢亭", raw: "瓢亭" },
      ])
    ).toBe("B");
  });

  it("C-U3: template body extraction works without fences", () => {
    const unfenced = `# Title

{full_name} 様

お世話になっております。
・エリア: {area}

### 規則

- do not include
`;
    const body = extractCorrespondenceTemplateBody(unfenced);
    expect(body).toMatch(/\{full_name\} 様/);
    expect(body).toMatch(/\{area\}/);
    expect(body).not.toMatch(/### 規則/);

    const fenced = "intro\n```\nHello {name}\n```\n### rules\n";
    expect(extractCorrespondenceTemplateBody(fenced)).toBe("Hello {name}");
  });
});
