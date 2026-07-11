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
import { ROOT_DIR } from "../src/lib/tenant.js";
import {
  calendarFileSchema,
  tasksFileSchema,
  oneOnOnesFileSchema,
  externalContactsFileSchema,
  stakeholdersFileSchema,
} from "../schemas/executive.js";

const execDir = join(getDataDir(), "executive");
const templateExecDir = join(ROOT_DIR, "tenants/_template/data/executive");

function localExecutiveFile(name: string): string {
  return join(execDir, name);
}

describe("executive data (Secretary Agent SoT)", () => {
  it("validates canonical calendar.yaml.example", () => {
    const cal = readYamlFile(
      join(templateExecDir, "calendar.yaml.example"),
      calendarFileSchema
    );
    expect(cal.events.length).toBeGreaterThanOrEqual(0);
    const withEvents = readYamlFile(
      join(templateExecDir, "calendar.yaml.example"),
      calendarFileSchema
    );
    if (withEvents.events.length > 0) {
      expect(withEvents.events[0].id).toMatch(/^EVT-\d{3,}$/);
    }
  });

  it("validates canonical tasks.yaml.example", () => {
    const tasks = readYamlFile(join(templateExecDir, "tasks.yaml.example"), tasksFileSchema);
    expect(Array.isArray(tasks.tasks)).toBe(true);
  });

  it("validates canonical one-on-ones.yaml.example", () => {
    const ooo = readYamlFile(
      join(templateExecDir, "one-on-ones.yaml.example"),
      oneOnOnesFileSchema
    );
    expect(Array.isArray(ooo.one_on_ones)).toBe(true);
  });

  it("validates canonical external-contacts.yaml.example", () => {
    const ext = readYamlFile(
      join(templateExecDir, "external-contacts.yaml.example"),
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

  it("validates the canonical empty stakeholder scaffold fallback", () => {
    const scaffold = stakeholdersFileSchema.parse({ stakeholders: [] });
    expect(scaffold.stakeholders).toEqual([]);
  });

  it(
    "passes validateAll (executive yaml optional when absent)",
    () => {
      const result = validateAll();
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    },
    15_000
  );
});
