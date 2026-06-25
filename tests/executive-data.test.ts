import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
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
import { readYamlFile, getDataDir } from "../src/lib/utils.js";
import {
  calendarFileSchema,
  tasksFileSchema,
  oneOnOnesFileSchema,
  externalContactsFileSchema,
  stakeholdersFileSchema,
} from "../schemas/executive.js";

const execDir = join(getDataDir(), "executive");

function localExecutiveFile(name: string): string {
  return join(execDir, name);
}

describe("executive data (Secretary Agent SoT)", () => {
  it("validates calendar.yaml.example in repo", () => {
    const cal = readYamlFile(
      join(execDir, "calendar.yaml.example"),
      calendarFileSchema
    );
    expect(cal.events.length).toBeGreaterThanOrEqual(0);
    const withEvents = readYamlFile(
      join(execDir, "calendar.yaml.example"),
      calendarFileSchema
    );
    if (withEvents.events.length > 0) {
      expect(withEvents.events[0].id).toMatch(/^EVT-\d{3,}$/);
    }
  });

  it("validates tasks.yaml.example in repo", () => {
    const tasks = readYamlFile(join(execDir, "tasks.yaml.example"), tasksFileSchema);
    expect(Array.isArray(tasks.tasks)).toBe(true);
  });

  it("validates one-on-ones.yaml.example in repo", () => {
    const ooo = readYamlFile(join(execDir, "one-on-ones.yaml.example"), oneOnOnesFileSchema);
    expect(Array.isArray(ooo.one_on_ones)).toBe(true);
  });

  it("validates external-contacts.yaml.example in repo", () => {
    const ext = readYamlFile(
      join(execDir, "external-contacts.yaml.example"),
      externalContactsFileSchema
    );
    for (const c of ext.contacts) {
      expect(c.id).toMatch(/^EXT-\d{3,}$/);
    }
  });

  it("loads local calendar.yaml when present (gitignore)", () => {
    if (!existsSync(localExecutiveFile("calendar.yaml"))) return;
    const cal = loadExecutiveCalendar();
    expect(cal.events.length).toBeGreaterThanOrEqual(0);
  });

  it("loads local tasks.yaml when present (gitignore)", () => {
    if (!existsSync(localExecutiveFile("tasks.yaml"))) return;
    const tasks = loadExecutiveTasks();
    expect(Array.isArray(tasks.tasks)).toBe(true);
  });

  it("loads local one-on-ones.yaml when present (gitignore)", () => {
    if (!existsSync(localExecutiveFile("one-on-ones.yaml"))) return;
    const ooo = loadOneOnOnes();
    expect(Array.isArray(ooo.one_on_ones)).toBe(true);
  });

  it("loads local external-contacts.yaml when present (gitignore)", () => {
    if (!existsSync(localExecutiveFile("external-contacts.yaml"))) return;
    const ext = loadExternalContacts();
    expect(Array.isArray(ext.contacts)).toBe(true);
  });

  it("loads stakeholders.yaml when present (local gitignore file)", () => {
    if (!stakeholdersFileExists()) return;
    const reg = loadStakeholders();
    expect(reg.stakeholders.length).toBeGreaterThan(0);
  });

  it("validates stakeholders.yaml.example in repo", () => {
    const example = readYamlFile(
      join(execDir, "stakeholders.yaml.example"),
      stakeholdersFileSchema
    );
    expect(example.stakeholders.some((s) => s.id === "STK-001")).toBe(true);
    expect(example.stakeholders.some((s) => s.id === "STK-003")).toBe(true);
    expect(example.stakeholders.some((s) => s.id === "STK-004")).toBe(true);
    const stk004 = example.stakeholders.find((s) => s.id === "STK-004");
    expect(stk004?.contract_ids).toContain("CTR-006");
    expect(stk004?.contract_ids).toContain("CTR-007");
  });

  it("passes validateAll (executive yaml optional when absent)", () => {
    const result = validateAll();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
