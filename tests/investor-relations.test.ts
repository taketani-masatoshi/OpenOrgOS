// @catalog-ids: investor_relations
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capTableFileSchema,
  disclosureCalendarFileSchema,
  investorRegistryFileSchema,
  irMaterialsFileSchema,
} from "../schemas/investor-relations/index.js";
import {
  expandDisclosureCalendar,
  formatCapTableReviewMarkdown,
  reviewCapTable,
} from "../src/lib/investor-relations/index.js";
import { readYamlFile } from "../src/lib/utils.js";
import { ROOT_DIR } from "../src/lib/tenant.js";
import { clearSkillRegistryCache, getSkillById } from "../src/lib/skill-registry.js";

const seedIr = join(ROOT_DIR, "steward/modules/investor_relations/seed");

describe("investor-relations schema", () => {
  it("parses seed cap-table example", () => {
    const data = readYamlFile(
      join(seedIr, "cap-table.yaml.example"),
      capTableFileSchema,
    );
    expect(data.lines).toHaveLength(3);
    const total = data.lines.reduce((s, l) => s + l.fully_diluted_pct, 0);
    expect(total).toBe(100);
  });

  it("parses seed investor-registry example", () => {
    const data = readYamlFile(
      join(seedIr, "investor-registry.yaml.example"),
      investorRegistryFileSchema,
    );
    expect(data.contacts[0]?.id).toBe("INV-001");
  });

  it("parses seed disclosure-calendar example", () => {
    const data = readYamlFile(
      join(seedIr, "disclosure-calendar.yaml.example"),
      disclosureCalendarFileSchema,
    );
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("parses seed ir-materials example", () => {
    const data = readYamlFile(
      join(seedIr, "ir-materials.yaml.example"),
      irMaterialsFileSchema,
    );
    expect(data.materials[0]?.id).toMatch(/^IRM-/);
  });
});

describe("investor-relations lib", () => {
  it("reviews cap table totals", () => {
    const file = readYamlFile(
      join(seedIr, "cap-table.yaml.example"),
      capTableFileSchema,
    );
    const result = reviewCapTable(file);
    expect(result.ok).toBe(true);
    expect(result.fully_diluted_total_pct).toBe(100);
    expect(formatCapTableReviewMarkdown(result)).toContain("OK");
  });

  it("flags cap table pct drift", () => {
    const file = readYamlFile(
      join(seedIr, "cap-table.yaml.example"),
      capTableFileSchema,
    );
    file.lines[0]!.fully_diluted_pct = 50;
    const result = reviewCapTable(file);
    expect(result.ok).toBe(false);
  });

  it("expands disclosure calendar deterministically", () => {
    const file = readYamlFile(
      join(seedIr, "disclosure-calendar.yaml.example"),
      disclosureCalendarFileSchema,
    );
    const items = expandDisclosureCalendar(file, {
      today: "2026-08-24",
      daysAhead: 90,
    });
    expect(items.some((i) => i.id === "DISC-Q3-EARNINGS")).toBe(true);
    expect(items[0]!.due_date <= items[items.length - 1]!.due_date).toBe(true);
  });
});

describe("investor-relations skill dispatch", () => {
  it("registers module cli skills", () => {
    clearSkillRegistryCache();
    const cap = getSkillById("ir_cap_table_review");
    const cal = getSkillById("ir_disclosure_calendar");
    expect(cap?.runtime).toBe("cli");
    expect(cap?.moduleId).toBe("investor_relations");
    expect(cal?.agent_id).toBe("investor_relations");
  });
});
