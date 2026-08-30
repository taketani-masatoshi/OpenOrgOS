import { describe, expect, it } from "vitest";
import { assessRequirementCoverage } from "../src/lib/iso-requirements.js";
import { loadRecordSpecs } from "../src/lib/iso-records.js";
import { loadControlMaps } from "../src/lib/control-framework.js";

describe("financial assertion pack", () => {
  it("covers existence, completeness, valuation, cut-off and presentation", () => {
    const coverage = assessRequirementCoverage("financial");
    expect(coverage.requirements.map((r) => r.id).sort()).toEqual(
      [
        "REQ-FIN-completeness-a",
        "REQ-FIN-cutoff-a",
        "REQ-FIN-existence-a",
        "REQ-FIN-presentation-a",
        "REQ-FIN-valuation-a",
      ].sort(),
    );
    expect(coverage.uncovered).toEqual([]);
    expect(coverage.orphan_controls).toEqual([]);
    expect(coverage.dangling).toEqual([]);
  });

  it("inspects GL, period-lock, subledger tie-out and month-close records", () => {
    const files = loadRecordSpecs("financial")!.records.map((r) => r.file);
    expect(files).toEqual(
      expect.arrayContaining([
        "journal-entries.yaml",
        "period-locks.yaml",
        "subledger-tie-out.csv",
        "valuation-check.csv",
        "month-close-checklist.md",
      ]),
    );
    expect(loadRecordSpecs("financial")!.records.every((r) => r.tenant_path)).toBe(true);
  });

  it("keeps finance as the primary agent so internal_audit stays independent", () => {
    const maps = loadControlMaps(["financial"]);
    expect(maps.every((c) => c.primary_agent === "finance")).toBe(true);
  });
});
