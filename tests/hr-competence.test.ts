import { describe, expect, it } from "vitest";
import {
  assessTrainingCoverage,
  buildCompetenceMatrix,
} from "../src/lib/hr/competence.js";
import { loadCompetence, loadTraining } from "../src/lib/data.js";
import { setTenantId } from "../src/lib/tenant.js";
import type { CompetenceFile } from "../schemas/hr.js";

describe("competence matrix", () => {
  setTenantId("mal");

  it("produces a cell for every role requirement, not every assessment", () => {
    const file = loadCompetence();
    const matrix = buildCompetenceMatrix(file);
    const expected = file.roles.reduce(
      (sum, role) =>
        sum +
        role.members.length *
          file.competences.filter((c) => c.required[role.id] !== undefined)
            .length,
      0,
    );
    expect(matrix.cells).toHaveLength(expected);
  });

  it("treats a missing assessment as level 0 and reports it", () => {
    const file: CompetenceFile = {
      version: "1",
      as_of: "2026-08-29",
      roles: [{ id: "ROLE-OPS", title: "ops", members: ["EMP-003"] }],
      competences: [
        {
          id: "CMP-99",
          title: "未評価の力量",
          reg_refs: [],
          statutory: true,
          required: { "ROLE-OPS": 2 },
        },
      ],
      assessments: [],
    };
    const matrix = buildCompetenceMatrix(file);
    expect(matrix.cells[0].current).toBe(0);
    expect(matrix.cells[0].gap).toBe(2);
    expect(matrix.issues.join()).toContain("no assessment for CMP-99");
  });

  it("flags a competence required by an unknown role", () => {
    const matrix = buildCompetenceMatrix({
      version: "1",
      as_of: "2026-08-29",
      roles: [],
      competences: [
        {
          id: "CMP-98",
          title: "x",
          reg_refs: [],
          statutory: false,
          required: { "ROLE-GHOST": 1 },
        },
      ],
      assessments: [],
    });
    expect(matrix.issues.join()).toContain("unknown role ROLE-GHOST");
  });

  it("MAL の力量マップは実在の従業員と力量だけを参照する", () => {
    expect(buildCompetenceMatrix().issues).toEqual([]);
  });
});

describe("training coverage", () => {
  setTenantId("mal");

  it("every statutory gap is planned for the person who has it", () => {
    const matrix = buildCompetenceMatrix();
    const coverage = assessTrainingCoverage(matrix, loadTraining());
    expect(coverage.uncovered.filter((c) => c.statutory)).toEqual([]);
    expect(coverage.issues).toEqual([]);
  });

  it("detects a gap that no session covers", () => {
    const matrix = buildCompetenceMatrix();
    const coverage = assessTrainingCoverage(matrix, {
      version: "1",
      fiscal_year: "FY2026",
      sessions: [],
      records: [],
    });
    expect(coverage.uncovered.length).toBe(matrix.gaps.length);
  });

  it("detects an audience that misses someone holding the gap", () => {
    const matrix = buildCompetenceMatrix();
    const target = matrix.gaps[0];
    const coverage = assessTrainingCoverage(matrix, {
      version: "1",
      fiscal_year: "FY2026",
      sessions: [
        {
          id: "TRN-900",
          title: "t",
          competence_ids: [target.competence_id],
          method: "workshop",
          duration_min: 30,
          planned_on: "2026-09-01",
          // Deliberately excludes the person who needs it.
          audience: ["EMP-001"],
          evaluation: "e",
        },
      ],
      records: [],
    });
    const missing = coverage.audience_gaps.find((a) => a.session_id === "TRN-900");
    expect(missing?.missing).toContain(target.employee_id);
  });

  it("keeps partial results visible as follow-up", () => {
    const coverage = assessTrainingCoverage(buildCompetenceMatrix(), loadTraining());
    expect(coverage.follow_up.every((f) => f.result !== "effective")).toBe(true);
    expect(coverage.follow_up.length).toBeGreaterThan(0);
  });
});
