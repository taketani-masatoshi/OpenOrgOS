import { describe, it, expect } from "vitest";
import { buildSecretaryEscalationMarkdown } from "../src/lib/secretary-consult.js";
import {
  buildGoogleCalendarEventBody,
  pushCalendarToGoogle,
} from "../src/lib/google-calendar-push.js";
import type { CalendarEvent } from "../schemas/executive.js";

describe("secretary consult", () => {
  it("builds orchestrator markdown with questions", () => {
    const md = buildSecretaryEscalationMarkdown({
      subject: "Git 方針",
      questions: ["gitignore で足りるか"],
      date: "2026-06-09",
    });
    expect(md).toContain("@steward/core/orchestrators/secretary_escalation.md");
    expect(md).toContain("**件名:** Git 方針");
    expect(md).toContain("1. gitignore で足りるか");
  });
});

describe("google calendar push", () => {
  const event: CalendarEvent = {
    id: "EVT-201",
    title: "MTG",
    type: "meeting",
    start: "2026-06-10T14:00",
    end: "2026-06-10T15:00",
    status: "confirmed",
    attendees: [],
    external_visible: false,
  };

  it("builds API body with stewardEventId", () => {
    const body = buildGoogleCalendarEventBody(event, { addMeet: true });
    expect(body.summary).toBe("MTG");
    expect((body.extendedProperties as { private: { stewardEventId: string } }).private.stewardEventId).toBe(
      "EVT-201"
    );
    expect(body.conferenceData).toBeDefined();
  });

  it("dry-run push counts create vs update", async () => {
    const withId = { ...event, google_event_id: "g-123" };
    const { result } = await pushCalendarToGoogle([event, withId], { dryRun: true });
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.dryRun).toBe(true);
  });
});

describe("executive backup gate", () => {
  it("exports check function", async () => {
    const { checkExecutiveBackupForWeekly } = await import("../src/lib/executive-backup.js");
    const r = checkExecutiveBackupForWeekly();
    expect(typeof r.ok).toBe("boolean");
  });
});
