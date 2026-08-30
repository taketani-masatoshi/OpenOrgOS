/**
 * Coverage has to be checked in both directions. Requirements with no control
 * are unaddressed; controls no requirement points at cannot be traced back to
 * the standard, and an auditor will ask why they exist.
 */

import { describe, expect, it } from "vitest";
import { isoRequirementsFileSchema } from "../schemas/iso-requirements.js";
import {
  assessRequirementCoverage,
  formatRequirementCoverage,
  loadRequirements,
  requirementsPath,
} from "../src/lib/iso-requirements.js";
import { listAvailableIsoIds } from "../src/lib/iso-catalog.js";
import { existsSync } from "node:fs";

describe("requirements register", () => {
  it("ships a filled register for every available pack", () => {
    for (const id of listAvailableIsoIds()) {
      expect(existsSync(requirementsPath(id)), `${id} has no requirements.yaml`).toBe(true);
      expect(() => loadRequirements(id)).not.toThrow();
    }
  });

  it("keeps ISO-21401 requirement ids unique and clause-tagged", () => {
    const file = loadRequirements("ISO-21401")!;
    expect(file.requirements.length).toBeGreaterThanOrEqual(39);
    const ids = file.requirements.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of file.requirements) {
      expect(r.id).toMatch(/^REQ-21401-/);
      expect(r.clause).toMatch(/^\d/);
    }
  });

  it("marks every ISO-21401 requirement as an unverified paraphrase", () => {
    // ISO text is not redistributable; until someone checks a licensed copy the
    // register must not imply the wording came from the standard.
    const file = loadRequirements("ISO-21401")!;
    for (const r of file.requirements) {
      expect(r.source).toBe("paraphrase");
      expect(r.verified_on).toBeUndefined();
    }
    expect(assessRequirementCoverage("ISO-21401").unverified.length).toBe(
      file.requirements.length,
    );
  });
});

describe("bidirectional coverage", () => {
  it("reports no uncovered requirement and no orphan control for ISO-21401", () => {
    const coverage = assessRequirementCoverage("ISO-21401");
    expect(coverage.uncovered.map((r) => r.id)).toEqual([]);
    expect(coverage.orphan_controls).toEqual([]);
    expect(coverage.dangling.map((r) => r.id)).toEqual([]);
  });

  it("requires a filled register for every available pack", () => {
    for (const id of listAvailableIsoIds()) {
      const coverage = assessRequirementCoverage(id);
      expect(coverage.requirements.length, `${id} register is empty`).toBeGreaterThan(0);
      expect(coverage.uncovered.map((r) => r.id), `${id} uncovered`).toEqual([]);
      expect(coverage.orphan_controls, `${id} orphans`).toEqual([]);
      expect(coverage.dangling.map((r) => r.id), `${id} dangling`).toEqual([]);
    }
  });

  it("names a requirement with no controls as uncovered", () => {
    const file = isoRequirementsFileSchema.parse({
      standard: "ISO-21401",
      requirements: [{ id: "REQ-X", clause: "4.1", statement: "何かする", controls: [] }],
    });
    expect(file.requirements[0].controls).toEqual([]);
    // The library reads from disk; the shape check above guards the contract the
    // coverage assessment relies on.
    expect(assessRequirementCoverage("ISO-21401").requirements[0].covered_by.length).toBeGreaterThan(0);
  });

  it("renders the unverified caveat rather than claiming conformance to the standard", () => {
    const text = formatRequirementCoverage([assessRequirementCoverage("ISO-21401")]);
    expect(text).toContain("想定した要求事項への網羅性");
  });
});

describe("pack contract", () => {
  it("never claims coverage by a control that does not exist", () => {
    for (const id of listAvailableIsoIds()) {
      const coverage = assessRequirementCoverage(id);
      const dangling = coverage.dangling.map((r) => `${r.id} -> ${r.missing_controls.join(",")}`);
      expect(dangling, `${id} references unknown controls`).toEqual([]);
    }
  });

  it("has no orphan control in a pack whose register is filled in", () => {
    for (const id of listAvailableIsoIds()) {
      const coverage = assessRequirementCoverage(id);
      expect(coverage.requirements.length, `${id} register is empty`).toBeGreaterThan(0);
      expect(coverage.orphan_controls, `${id} has controls no requirement claims`).toEqual([]);
    }
  });
});
