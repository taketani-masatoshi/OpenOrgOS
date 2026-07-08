import { describe, it, expect } from "vitest";
import { detectUnsyncedCalendarEvents } from "../src/lib/executive-calendar-sync.js";
import { formatSecretaryRelayBlock } from "../src/lib/secretary-relay.js";
import { buildSecretaryEscalationMarkdown } from "../src/lib/secretary-consult.js";
import type { CalendarEvent } from "../schemas/executive.js";

const baseEvent: CalendarEvent = {
  id: "EVT-301",
  title: "MTG",
  type: "meeting",
  start: "2026-06-15T14:00",
  end: "2026-06-15T15:00",
  status: "confirmed",
  attendees: [],
  external_visible: false,
};

describe("SEC-4 calendar sync", () => {
  it("detects events without google_event_id", () => {
    const unsynced = detectUnsyncedCalendarEvents([baseEvent], { fromDate: "2026-06-01" });
    expect(unsynced).toHaveLength(1);
    const synced = detectUnsyncedCalendarEvents(
      [{ ...baseEvent, google_event_id: "g-1" }],
      { fromDate: "2026-06-01" }
    );
    expect(synced).toHaveLength(0);
  });
});

describe("SEC-4 secretary relay", () => {
  it("formats relay block from merge content", () => {
    const md = [
      "# 統合",
      "## 統合結論",
      "Git 外管理で問題なし。",
      "## 段のアクション",
      "1. example のみ維持",
    ].join("\n");
    const block = formatSecretaryRelayBlock(md, "docs/reports/executive-notes/2026-06-09-escalation-x.md");
    expect(block).toContain("Secretary relay");
    expect(block).toContain("Git 外管理");
  });
});

describe("SEC-4 dispatch markdown", () => {
  it("still builds orchestrator input", () => {
    const md = buildSecretaryEscalationMarkdown({
      subject: "テスト",
      questions: ["Q1"],
      date: "2026-06-09",
    });
    expect(md).toContain("secretary_escalation.md");
  });
});
