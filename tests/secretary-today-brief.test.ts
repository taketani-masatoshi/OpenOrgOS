import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupSchedulingTenant,
  seedSchedulingTenant,
  schedulingCase,
} from "./helpers/scheduling-fixture.js";
import {
  findSchedulingCase,
  upsertSchedulingCase,
} from "../src/lib/scheduling-coordination/store.js";
import {
  askCeoInline,
  listPendingCeoInlineQuestions,
} from "../src/lib/correspondence/ceo-inline-question.js";
import { reconcileStaleSchedulingCeoQuestions } from "../src/lib/scheduling-coordination/ceo-question-reconcile.js";
import { buildSecretaryScheduleBrief } from "../src/lib/secretary/schedule-brief.js";
import type { CalendarEvent } from "../schemas/executive.js";

const tenantId = "test-secretary-today-brief";

describe("secretary today brief + stale CEO reconcile", () => {
  beforeEach(() => {
    seedSchedulingTenant(tenantId);
  });

  afterEach(() => {
    cleanupSchedulingTenant(tenantId);
  });

  it("includes upcoming confirmed meetings in secretary brief", () => {
    const events: CalendarEvent[] = [
      {
        id: "EVT-TODAY",
        title: "本日の打合せ",
        type: "meeting",
        start: "2026-07-13T10:00",
        end: "2026-07-13T11:00",
        status: "confirmed",
        attendees: [],
      },
      {
        id: "EVT-SW",
        title: "MAL×サウスウッド 定例打合せ",
        type: "meeting",
        start: "2026-07-18T12:00",
        end: "2026-07-18T13:00",
        status: "confirmed",
        attendees: ["竹谷"],
        location: "新橋",
      },
    ];
    const brief = buildSecretaryScheduleBrief({
      date: "2026-07-13",
      upcomingDays: 7,
      events,
    });
    expect(brief.today).toHaveLength(1);
    expect(brief.upcoming.some((e) => e.title.includes("サウスウッド"))).toBe(true);
    expect(brief.headline).toMatch(/本日/);
    expect(brief.headline).toMatch(/近日確定/);
    expect(brief.headline).toMatch(/サウスウッド/);
  });

  it("prefers real external meetings over rehearsal noise in upcoming line", () => {
    const events: CalendarEvent[] = [
      {
        id: "EVT-R",
        title: "CLIフルリハーサル",
        type: "meeting",
        start: "2026-07-16T10:00",
        end: "2026-07-16T11:00",
        status: "confirmed",
        attendees: [],
      },
      {
        id: "EVT-SW",
        title: "MAL×サウスウッド 定例打合せ",
        type: "meeting",
        start: "2026-07-18T12:00",
        end: "2026-07-18T13:00",
        status: "confirmed",
        attendees: ["竹谷"],
        external_visible: true,
      },
    ];
    const brief = buildSecretaryScheduleBrief({
      date: "2026-07-13",
      events,
    });
    expect(brief.headline).toMatch(/サウスウッド/);
    expect(brief.headline).not.toMatch(/リハーサル/);
  });

  it("dismisses pending CEO questions for closed scheduling cases", () => {
    const closed = schedulingCase("SCH-2026-901");
    upsertSchedulingCase({
      ...closed,
      status: "closed",
      next_action: "none",
      title: "MAL×サウスウッド 定例打合せ",
    });
    askCeoInline({
      mailId: `scheduling:${closed.id}`,
      schedulingCaseId: closed.id,
      subject: "日程確定 — MAL×サウスウッド",
      contextL1: "closed should dismiss",
      fields: [{ id: "schedule_ceo_choice", label: "確認", type: "choice", choices: ["はい"] }],
    });
    askCeoInline({
      mailId: `schedule-intake-case:${closed.id}:MSG-1`,
      subject: "起票確認",
      contextL1: "duplicate intake",
      fields: [
        { id: "schedule_intake_choice", label: "開始?", type: "choice", choices: ["続行", "中止"] },
      ],
    });
    expect(listPendingCeoInlineQuestions().length).toBeGreaterThanOrEqual(2);
    const dismissed = reconcileStaleSchedulingCeoQuestions();
    expect(dismissed.length).toBeGreaterThanOrEqual(2);
    expect(listPendingCeoInlineQuestions().every((q) => !q.mail_id.includes(closed.id))).toBe(
      true
    );
  });

  it("dismisses superseded intake confirmation when case already has a newer CEO question", () => {
    const open = schedulingCase("SCH-2026-902");
    upsertSchedulingCase({
      ...open,
      status: "awaiting_ceo",
      next_action: "ceo_confirm",
      exception_reason: "schedule_counter_needs_ceo",
      title: "live日程調整検証",
    });
    const active = askCeoInline({
      mailId: `scheduling:${open.id}`,
      schedulingCaseId: open.id,
      subject: "日程再提案確認 — live",
      contextL1: "active mid-gate",
      fields: [
        {
          id: "schedule_ceo_choice",
          label: "再提案?",
          type: "choice",
          choices: ["はい", "いいえ"],
        },
      ],
    });
    const latest = findSchedulingCase(open.id)!;
    upsertSchedulingCase({
      ...latest,
      status: "awaiting_ceo",
      next_action: "ceo_confirm",
      exception_reason: "schedule_counter_needs_ceo",
      ceo_question_id: active.id,
    });
    askCeoInline({
      mailId: `schedule-intake-case:${open.id}:MSG-OLD`,
      subject: "日程調整の起票確認 — live",
      contextL1: "stale intake",
      fields: [
        { id: "schedule_intake_choice", label: "開始?", type: "choice", choices: ["続行", "中止"] },
      ],
    });
    const dismissed = reconcileStaleSchedulingCeoQuestions();
    expect(dismissed.length).toBeGreaterThanOrEqual(1);
    const still = listPendingCeoInlineQuestions().filter((q) => q.mail_id.includes(open.id));
    expect(still).toHaveLength(1);
    expect(still[0]?.id).toBe(active.id);
    expect(still[0]?.fields.some((f) => f.id === "schedule_intake_choice")).toBe(false);
  });
});
