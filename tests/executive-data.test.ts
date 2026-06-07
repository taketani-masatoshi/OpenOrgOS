import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  loadExecutiveCalendar,
  loadExecutiveTasks,
  loadOneOnOnes,
  loadExternalContacts,
  loadStakeholders,
  validateAll,
} from "../src/lib/data.js";
import { stakeholdersFileExists } from "../src/lib/stakeholders.js";
import { readYamlFile, DATA_DIR } from "../src/lib/utils.js";
import { stakeholdersFileSchema } from "../schemas/executive.js";

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

  it("loads external-contacts.yaml with optional stakeholder_id", () => {
    const ext = loadExternalContacts();
    expect(ext.contacts.length).toBeGreaterThanOrEqual(2);
    for (const c of ext.contacts) {
      expect(c.id).toMatch(/^EXT-\d{3,}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
    const taketani = ext.contacts.find((c) => c.id === "EXT-004");
    expect(taketani?.stakeholder_id).toBe("STK-001");
    const southwood = ext.contacts.find((c) => c.id === "EXT-002");
    expect(southwood?.stakeholder_id).toBe("STK-003");
    const nihonJutaku = ext.contacts.find((c) => c.id === "EXT-005");
    expect(nihonJutaku?.stakeholder_id).toBe("STK-004");
    expect(nihonJutaku?.org).toBe("株式会社日本住宅");
  });

  it("loads stakeholders.yaml when present (local gitignore file)", () => {
    if (!stakeholdersFileExists()) return;
    const reg = loadStakeholders();
    const stk = reg.stakeholders.find((s) => s.id === "STK-001");
    expect(stk?.name).toBe("竹谷昌敏");
    expect(stk?.contract_ids).toContain("CTR-001");
    const stk004 = reg.stakeholders.find((s) => s.id === "STK-004");
    expect(stk004?.org).toBe("株式会社日本住宅");
    expect(stk004?.contract_ids).toEqual(
      expect.arrayContaining(["CTR-006", "CTR-007"])
    );
  });

  it("validates stakeholders.yaml.example in repo", () => {
    const example = readYamlFile(
      join(DATA_DIR, "executive/stakeholders.yaml.example"),
      stakeholdersFileSchema
    );
    expect(example.stakeholders.some((s) => s.id === "STK-001")).toBe(true);
    expect(example.stakeholders.some((s) => s.id === "STK-003")).toBe(true);
    expect(example.stakeholders.some((s) => s.id === "STK-004")).toBe(true);
    const stk004 = example.stakeholders.find((s) => s.id === "STK-004");
    expect(stk004?.contract_ids).toContain("CTR-006");
    expect(stk004?.contract_ids).toContain("CTR-007");
  });

  it("passes validateAll including executive files", () => {
    const result = validateAll();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
