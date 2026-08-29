import { describe, expect, it } from "vitest";
import {
  computePayrollMonth,
  computeSocialInsurance,
  resolveStandardRemuneration,
} from "../src/lib/finance/payroll-jp.js";

describe("payroll-jp denshi keisan", () => {
  it("resolves standard remuneration grade for gross pay", () => {
    expect(resolveStandardRemuneration(320_000)).toBe(320_000);
    expect(resolveStandardRemuneration(88_000)).toBe(88_000);
  });

  it("computes social insurance with employer/employee split", () => {
    const social = computeSocialInsurance({ grossYen: 320_000 });
    expect(social.standard_remuneration_yen).toBe(320_000);
    expect(social.health_employee_yen).toBe(16_000);
    expect(social.pension_employee_yen).toBe(29_280);
    expect(social.employment_employee_yen).toBe(1_920);
    expect(social.employee_total_yen).toBe(47_200);
    expect(social.employer_total_yen).toBe(48_320);
  });

  it("matches denshi keisan fixture for 280,000 yen monthly (0 dependents)", () => {
    const result = computePayrollMonth({
      month: "2026-09",
      grossYen: 280_000,
      dependents: 0,
    });
    expect(result.salary_income_deduction_yen).toBe(103_667);
    expect(result.taxable_salary_income_yen).toBe(95_033);
    expect(result.withholding_yen).toBe(4_851);
    expect(result.net_pay_yen).toBe(233_849);
  });

  it("matches denshi keisan fixture for 320,000 yen monthly (0 dependents)", () => {
    const result = computePayrollMonth({
      month: "2026-09",
      grossYen: 320_000,
      dependents: 0,
    });
    expect(result.salary_income_deduction_yen).toBe(119_667);
    expect(result.taxable_salary_income_yen).toBe(113_133);
    expect(result.withholding_yen).toBe(5_775);
    expect(result.net_pay_yen).toBe(267_025);
  });
});
