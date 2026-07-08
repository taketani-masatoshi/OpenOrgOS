import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "../schemas/executive.js";
import {
  detectCalendarConflicts,
  filterEventsInRange,
  mondayOfWeek,
  addDays,
} from "../src/lib/executive-calendar.js";
import { buildExecutiveBriefMarkdown } from "../src/commands/executive.js";

const sampleEvents: CalendarEvent[] = [
  {
    id: "EVT-101",
    title: "A",
    type: "meeting",
    start: "2026-06-10T10:00",
    end: "2026-06-10T11:00",
    status: "confirmed",
    attendees: [],
    external_visible: false,
  },
  {
    id: "EVT-102",
    title: "B",
    type: "meeting",
    start: "2026-06-10T10:30",
    end: "2026-06-10T11:30",
    status: "confirmed",
    attendees: [],
    external_visible: false,
  },
  {
    id: "EVT-103",
    title: "Cancelled",
    type: "block",
    start: "2026-06-10T09:00",
    end: "2026-06-10T12:00",
    status: "cancelled",
    attendees: [],
    external_visible: false,
  },
];

describe("executive calendar lib", () => {
  it("detects overlapping events", () => {
    const conflicts = detectCalendarConflicts(sampleEvents);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.a.id).toBe("EVT-101");
    expect(conflicts[0]?.b.id).toBe("EVT-102");
  });

  it("filters events by date range", () => {
    const filtered = filterEventsInRange(sampleEvents, "2026-06-10", "2026-06-10");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.status !== "cancelled")).toBe(true);
  });

  it("computes week range from monday", () => {
    expect(mondayOfWeek("2026-06-11")).toBe("2026-06-08");
    expect(addDays("2026-06-08", 6)).toBe("2026-06-14");
  });
});

describe("executive brief", () => {
  it("builds brief markdown without L2 fields", () => {
    const md = buildExecutiveBriefMarkdown("2026-06-09");
    expect(md).toContain("# 社長週次ブリーフ");
    expect(md).toContain("今週の予定");
    expect(md).not.toMatch(/@/);
  });
});
