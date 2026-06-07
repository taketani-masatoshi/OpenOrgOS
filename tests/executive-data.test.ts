import { describe, it, expect } from "vitest";
import {
  loadExecutiveCalendar,
  loadExecutiveTasks,
  loadOneOnOnes,
  loadExternalContacts,
  validateAll,
} from "../src/lib/data.js";

describe("executive data (Secretary Agent SoT)", () => {
  it("loads calendar.yaml with valid schema", () => {
    const cal = loadExecutiveCalendar();
    expect(cal.events.length).toBeGreaterThanOrEqual(2);
    const evt = cal.events.find((e) => e.id === "EVT-001");
    expect(evt?.type).toBe("meeting");
    expect(evt?.external_visible).toBe(false);
    const tbd = cal.events.find((e) => e.id === "EVT-002");
    expect(tbd?.status).toBe("tbd");
  });

  it("loads tasks.yaml with CEO tasks distinct from dashboard P0", () => {
    const tasks = loadExecutiveTasks();
    expect(tasks.tasks.length).toBeGreaterThanOrEqual(3);
    const p0 = tasks.tasks.find((t) => t.id === "TASK-001");
    expect(p0?.priority).toBe("p0");
    expect(p0?.category).toBe("business");
  });

  it("loads one-on-ones.yaml with co-director entry", () => {
    const ooo = loadOneOnOnes();
    const entry = ooo.one_on_ones.find((o) => o.id === "OOO-001");
    expect(entry?.person).toBe("宮城万貴子");
    expect(entry?.cadence).toBe("monthly");
    expect(entry?.action_items.length).toBeGreaterThanOrEqual(1);
  });

  it("loads external-contacts.yaml without PII overload", () => {
    const ext = loadExternalContacts();
    expect(ext.contacts.length).toBeGreaterThanOrEqual(2);
    for (const c of ext.contacts) {
      expect(c.id).toMatch(/^EXT-\d{3,}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("passes validateAll including executive files", () => {
    const result = validateAll();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
