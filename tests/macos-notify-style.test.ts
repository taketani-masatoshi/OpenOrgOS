import { describe, expect, it } from "vitest";
import {
  buildTodayDigestNotification,
  formatTodayDigestSlotLabel,
  sanitizeNotificationText,
} from "../src/lib/notifications/macos-notify.js";

describe("macos notify style", () => {
  it("maps digest slots to readable labels", () => {
    expect(formatTodayDigestSlotLabel("0900")).toBe("朝 09:00");
    expect(formatTodayDigestSlotLabel("1300")).toBe("午後 13:00");
    expect(formatTodayDigestSlotLabel("1700")).toBe("夕方 17:00");
    expect(formatTodayDigestSlotLabel("1257")).toBe("12:57");
  });

  it("sanitizes middle dots and fullwidth parens for banner stability", () => {
    expect(sanitizeNotificationText("MAL · Today（午後）")).toBe("MAL - Today(午後)");
  });

  it("builds Today digest notification without path subtitle or raw HHMM title", () => {
    const n = buildTodayDigestNotification({
      slot: "1300",
      summary: "判断 2 件 · 承認 0 件 · 高優先メール 0 件",
      updatedAt: "7/13 13:00",
    });
    expect(n.title).toBe("MAL Today");
    expect(n.subtitle).toContain("午後 13:00");
    expect(n.subtitle).toContain("更新");
    expect(n.subtitle).toContain("7/13 13:00");
    expect(n.body).not.toContain("·");
    expect(n.body).toContain("判断 2 件");
    expect(n.kind).toBe("today");
  });
});
