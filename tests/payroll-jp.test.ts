import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ROOT_DIR } from "../src/lib/utils.js";
import type { PayrollRates } from "../src/lib/finance/payroll-jp.js";
import { describe, expect, it } from "vitest";
import {
  computePayrollMonth,
  computeSocialInsurance,
  resolveStandardRemuneration,
} from "../src/lib/finance/payroll-jp.js";

const rates: PayrollRates = {
  ...YAML.parse(
    readFileSync(
      join(
        ROOT_DIR,
        "steward/jurisdiction-packs/JP/modules/jp_payroll/seed/payroll-rates-2026.yaml.example"
      ),
      "utf8"
    )
  ),
  fiscal_year: "FY2026",
  effective_from: "2026-04",
  effective_to: "2027-03",
  insurer_id: "TEST-INSURER",
};

describe("payroll-jp denshi keisan", () => {
  it("resolves standard remuneration grade for gross pay", () => {
    expect(resolveStandardRemuneration(320_000, rates)).toBe(320_000);
    expect(resolveStandardRemuneration(88_000, rates)).toBe(88_000);
  });

  it("computes social insurance with employer/employee split", () => {
    const social = computeSocialInsurance({
      grossYen: 320_000,
      standardRemunerationYen: 320000,
      pensionStandardRemunerationYen: 320000,
      rates,
    });
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
      rates,
      healthStandardRemunerationYen: 280000,
      pensionStandardRemunerationYen: 280000,
      dependents: 0,
    });
    expect(result.salary_income_deduction_yen).toBe(78_277);
    expect(result.taxable_salary_income_yen).toBe(112_089);
    expect(result.withholding_yen).toBe(5_720);
    expect(result.net_pay_yen).toBe(232_980);
  });

  it("matches denshi keisan fixture for 320,000 yen monthly (0 dependents)", () => {
    const result = computePayrollMonth({
      month: "2026-09",
      grossYen: 320_000,
      rates,
      healthStandardRemunerationYen: 320000,
      pensionStandardRemunerationYen: 320000,
      dependents: 0,
    });
    expect(result.salary_income_deduction_yen).toBe(88_507);
    expect(result.taxable_salary_income_yen).toBe(135_959);
    expect(result.withholding_yen).toBe(6_940);
    expect(result.net_pay_yen).toBe(265_860);
  });
});
