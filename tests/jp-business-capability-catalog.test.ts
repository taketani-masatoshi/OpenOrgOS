import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const ROOT = join(import.meta.dirname, "..");
const YAML_PATH = join(ROOT, "steward/jurisdiction-packs/JP/business-capability-catalog.yaml");
const CSV_PATH = join(ROOT, "steward/jurisdiction-packs/JP/business-capability-catalog.csv");

describe("JP business capability catalog", () => {
  it("loads YAML with expected sections", () => {
    const doc = YAML.parse(readFileSync(YAML_PATH, "utf-8"));
    expect(doc.schema_version).toBe(1);
    expect(doc.jurisdiction).toBe("JP");
    expect(doc.categories.length).toBeGreaterThanOrEqual(10);
    expect(doc.agents.length).toBeGreaterThanOrEqual(6);
    expect(doc.modules.length).toBeGreaterThanOrEqual(20);
    expect(doc.skills.length).toBeGreaterThanOrEqual(20);
    expect(doc.summary.p0_gaps.length).toBeGreaterThan(0);
  });

  it("CSV has header and rows for each entity type", () => {
    const lines = readFileSync(CSV_PATH, "utf-8").trim().split("\n");
    expect(lines[0]).toContain("entity_type");
    const types = new Set(lines.slice(1).map((l) => l.split(",")[0]));
    expect(types).toContain("agent");
    expect(types).toContain("module");
    expect(types).toContain("skill");
    expect(types).toContain("category");
    expect(lines.length).toBeGreaterThan(100);
  });

  it("skill agent_id references known agents", () => {
    const doc = YAML.parse(readFileSync(YAML_PATH, "utf-8"));
    const agentIds = new Set(doc.agents.map((a: { id: string }) => a.id));
    for (const skill of doc.skills) {
      expect(agentIds.has(skill.agent_id), `${skill.id} → ${skill.agent_id}`).toBe(true);
    }
  });
});
