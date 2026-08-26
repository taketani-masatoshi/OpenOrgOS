import { describe, expect, it } from "vitest";
import {
  evaluateRosterPayrollConsistency,
  formatConsistencyNote,
} from "../src/lib/hr/roster-payroll-consistency.js";

describe("roster-payroll-consistency", () => {
  it("flags unknown payroll employee_id with fix_hints", () => {
    const issues = evaluateRosterPayrollConsistency({
      employees: [{ id: "EMP-001", status: "active" }],
      payrollEmployeeIds: ["EMP-001", "EMP-999"],
      hasWithholding: true,
      hasSocialInsurance: true,
      orgChartEmployeeIds: [],
    });
    const unknown = issues.find((i) => i.code === "payroll_id_unknown");
    expect(unknown).toBeDefined();
    expect(unknown?.level).toBe("warning");
    expect(unknown?.fix_hints.length).toBeGreaterThan(0);
    expect(unknown?.message).toContain("EMP-999");
    expect(unknown?.message).not.toMatch(/error/i);
  });

  it("flags active missing from payroll (mal-like) without errors", () => {
    const issues = evaluateRosterPayrollConsistency({
      employees: [
        { id: "EMP-001", status: "active" },
        { id: "EMP-002", status: "active" },
        { id: "EMP-003", status: "active" },
        { id: "EMP-004", status: "active" },
      ],
      payrollEmployeeIds: ["EMP-003"],
      hasWithholding: true,
      hasSocialInsurance: true,
      orgChartEmployeeIds: ["EMP-003"],
    });
    expect(issues.every((i) => i.level === "warning")).toBe(true);
    const missing = issues.filter((i) => i.code === "active_missing_from_payroll");
    expect(missing.map((m) => m.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("EMP-001"),
        expect.stringContaining("EMP-002"),
        expect.stringContaining("EMP-004"),
      ]),
    );
    expect(missing.some((m) => m.message.includes("EMP-003"))).toBe(false);
    expect(issues.some((i) => i.code === "payroll_count_mismatch")).toBe(false);
    for (const m of missing) {
      expect(m.fix_hints.some((h) => /inactive/.test(h))).toBe(true);
      expect(m.fix_hints.some((h) => /退職が確定/.test(h))).toBe(true);
    }
  });

  it("returns no issues when roster, payroll, and org-chart align", () => {
    const issues = evaluateRosterPayrollConsistency({
      employees: [
        { id: "EMP-001", status: "active" },
        { id: "EMP-002", status: "active" },
      ],
      payrollEmployeeIds: ["EMP-001", "EMP-002"],
      hasWithholding: true,
      hasSocialInsurance: true,
      orgChartEmployeeIds: ["EMP-001", "EMP-002"],
    });
    expect(issues).toEqual([]);
  });

  it("flags has_social_insurance with empty employee_ids", () => {
    const issues = evaluateRosterPayrollConsistency({
      employees: [
        { id: "EMP-001", status: "active" },
        { id: "EMP-002", status: "active" },
      ],
      payrollEmployeeIds: [],
      hasWithholding: false,
      hasSocialInsurance: true,
      orgChartEmployeeIds: [],
    });
    expect(issues.some((i) => i.code === "si_flag_without_ids")).toBe(true);
    expect(issues.every((i) => i.level === "warning")).toBe(true);
    expect(
      issues.filter((i) => i.code === "active_missing_from_payroll"),
    ).toHaveLength(0);
  });

  it("formatConsistencyNote appends first fix hint", () => {
    const note = formatConsistencyNote({
      code: "payroll_count_mismatch",
      level: "warning",
      file: "data/finance/payroll.yaml",
      message: "可能性: 件数不一致。",
      fix_hints: ["employee_ids を合わせる", "status を見直す"],
    });
    expect(note).toContain("可能性: 件数不一致。");
    expect(note).toContain("修正案: employee_ids を合わせる");
  });
});
