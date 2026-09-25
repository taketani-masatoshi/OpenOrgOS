import { assertJapaneseFinanceEngine } from "./jp-engine-guard.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";
import { resolveCompanyFiscalYearEndMonth, resolveFiscalYear } from "./fiscal-year.js";

const bracketSchema = z.object({
  up_to_yen: z.number().positive(),
  rate_pct: z.number().nonnegative().optional(),
  minus_yen: z.number().nonnegative().optional(),
  fixed_yen: z.number().nonnegative().optional(),
});

const payrollRatesSchema = z.object({
  version: z.literal(1),
  fiscal_year: z.string().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
  insurer_id: z.string().optional(),
  method: z.literal("denshi_keisan_tokurei").default("denshi_keisan_tokurei"),
  salary_income_deduction: z.array(bracketSchema).min(1),
  basic_deduction_monthly_yen: z.number().nonnegative(),
  dependent_deduction_monthly_yen: z.number().nonnegative(),
  income_tax_brackets: z.array(bracketSchema).min(1),
  social_insurance: z.object({
    health_employee_rate_pct: z.number().nonnegative(),
    health_employer_rate_pct: z.number().nonnegative(),
    pension_employee_rate_pct: z.number().nonnegative(),
    pension_employer_rate_pct: z.number().nonnegative(),
    employment_employee_rate_pct: z.number().nonnegative(),
    employment_employer_rate_pct: z.number().nonnegative(),
    standard_remuneration_grades: z
      .array(
        z.object({
          grade: z.number().int().positive(),
          lower_yen: z.number().nonnegative(),
          upper_yen: z.number().nonnegative(),
          monthly_yen: z.number().positive(),
        })
      )
      .min(1),
  }),
});

export type PayrollRates = z.output<typeof payrollRatesSchema>;

export type SocialInsuranceBreakdown = {
  standard_remuneration_yen: number;
  health_employee_yen: number;
  health_employer_yen: number;
  pension_employee_yen: number;
  pension_employer_yen: number;
  employment_employee_yen: number;
  employment_employer_yen: number;
  employee_total_yen: number;
  employer_total_yen: number;
};

export type PayrollMonthResult = {
  month: string;
  gross_yen: number;
  salary_income_deduction_yen: number;
  taxable_salary_income_yen: number;
  withholding_yen: number;
  social_insurance: SocialInsuranceBreakdown;
  net_pay_yen: number;
};

function fiscalYearFileSuffix(fiscalYear: string): string {
  const upper = fiscalYear.toUpperCase();
  return upper.startsWith("FY") ? upper.slice(2) : upper;
}

export function loadPayrollRates(fiscalYear = "FY2026"): PayrollRates {
  const suffix = fiscalYearFileSuffix(fiscalYear);
  const tenantPath = join(getDataDir(), "finance", `payroll-rates-${suffix}.yaml`);
  const path = tenantPath;
  if (!existsSync(path)) {
    throw new Error(`Payroll rates file not found for ${fiscalYear}`);
  }
  return payrollRatesSchema.parse(YAML.parse(readFileSync(path, "utf-8")) as unknown);
}

export function resolveStandardRemuneration(
  grossYen: number,
  rates: PayrollRates = loadPayrollRates()
): number {
  const grade = rates.social_insurance.standard_remuneration_grades.find(
    (row) => grossYen >= row.lower_yen && grossYen <= row.upper_yen
  );
  if (!grade)
    throw new Error("Standard remuneration grade out of range; confirmed assessment required");
  return grade.monthly_yen;
}

export function computeSocialInsurance(input: {
  grossYen: number;
  standardRemunerationYen?: number;
  pensionStandardRemunerationYen?: number;
  rates?: PayrollRates;
}): SocialInsuranceBreakdown {
  const rates = input.rates ?? loadPayrollRates();
  const standard = input.standardRemunerationYen;
  const pensionStandard = input.pensionStandardRemunerationYen;
  if (
    !Number.isSafeInteger(standard) ||
    !Number.isSafeInteger(pensionStandard) ||
    !standard ||
    !pensionStandard ||
    standard < 0 ||
    pensionStandard < 0
  ) {
    throw new Error("Separate confirmed health and pension standard remuneration required");
  }
  const si = rates.social_insurance;
  const healthEmployee = Math.floor((standard * si.health_employee_rate_pct) / 100);
  const healthEmployer = Math.floor((standard * si.health_employer_rate_pct) / 100);
  const pensionEmployee = Math.floor((pensionStandard * si.pension_employee_rate_pct) / 100);
  const pensionEmployer = Math.floor((pensionStandard * si.pension_employer_rate_pct) / 100);
  const employmentEmployee = Math.floor((input.grossYen * si.employment_employee_rate_pct) / 100);
  const employmentEmployer = Math.floor((input.grossYen * si.employment_employer_rate_pct) / 100);
  const employeeTotal = healthEmployee + pensionEmployee + employmentEmployee;
  const employerTotal = healthEmployer + pensionEmployer + employmentEmployer;
  return {
    standard_remuneration_yen: standard,
    health_employee_yen: healthEmployee,
    health_employer_yen: healthEmployer,
    pension_employee_yen: pensionEmployee,
    pension_employer_yen: pensionEmployer,
    employment_employee_yen: employmentEmployee,
    employment_employer_yen: employmentEmployer,
    employee_total_yen: employeeTotal,
    employer_total_yen: employerTotal,
  };
}

/** NTA 2026 monthly table A: income AFTER employee social insurance. */
export function computeSalaryIncomeDeduction(afterSocialYen: number, rates?: PayrollRates): number {
  assertWithholdingYear(rates?.fiscal_year ?? "FY2026");
  if (!Number.isSafeInteger(afterSocialYen) || afterSocialYen < 0)
    throw new Error("Invalid salary amount");
  if (afterSocialYen <= 158333) return 54167;
  if (afterSocialYen <= 299999) return Math.ceil((afterSocialYen * 30 + 666700) / 100);
  if (afterSocialYen <= 549999) return Math.ceil((afterSocialYen * 20 + 3666700) / 100);
  if (afterSocialYen <= 708330) return Math.ceil((afterSocialYen * 10 + 9166700) / 100);
  return 162500;
}

function assertWithholdingYear(year: string): void {
  if (year !== "FY2026" && year !== "2026")
    throw new Error(`Unsupported withholding year: ${year}`);
}

export function computeWithholding(input: {
  grossYen: number;
  socialEmployeeYen: number;
  dependents?: number;
  fiscalYear?: string;
  rates?: PayrollRates;
}): { taxableSalaryIncomeYen: number; withholdingYen: number } {
  assertWithholdingYear(input.fiscalYear ?? input.rates?.fiscal_year ?? "FY2026");
  const dependents = input.dependents ?? 0;
  if (
    ![input.grossYen, input.socialEmployeeYen, dependents].every(
      (x) => Number.isSafeInteger(x) && x >= 0
    ) ||
    input.socialEmployeeYen > input.grossYen
  )
    throw new Error("Invalid withholding inputs");
  const a = input.grossYen - input.socialEmployeeYen;
  const deduction = computeSalaryIncomeDeduction(a);
  const basic =
    a <= 2120833 ? 48334 : a <= 2162499 ? 40000 : a <= 2204166 ? 26667 : a <= 2245833 ? 13334 : 0;
  const taxable = Math.max(0, a - deduction - basic - dependents * 31667);
  // NTA table IV: integer rate units (1 / 100000), nearest ten yen.
  const rows = [
    [162500, 5105, 0],
    [275000, 10210, 8296],
    [579166, 20420, 36374],
    [750000, 23483, 54113],
    [1500000, 33693, 130688],
    [3333333, 40840, 237893],
    [Infinity, 45945, 408061],
  ];
  const row = rows.find((r) => taxable <= r[0]!)!;
  const tax = Math.max(0, Math.round((taxable * row[1]! - row[2]! * 100000) / 1000000) * 10);
  return { taxableSalaryIncomeYen: taxable, withholdingYen: tax };
}

export function computePayrollMonth(input: {
  month: string;
  grossYen: number;
  healthStandardRemunerationYen?: number;
  pensionStandardRemunerationYen?: number;
  dependents?: number;
  rates?: PayrollRates;
}): PayrollMonthResult {
  assertJapaneseFinanceEngine();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error("Invalid payroll month");
  const year = resolveFiscalYear(resolveCompanyFiscalYearEndMonth(), input.month);
  const rates = input.rates ?? loadPayrollRates(year);
  if (
    rates.fiscal_year !== year ||
    !rates.insurer_id ||
    !rates.effective_from ||
    !rates.effective_to ||
    input.month < rates.effective_from ||
    input.month > rates.effective_to
  )
    throw new Error("Payroll rates not verified for payment month and insurer");
  const social = computeSocialInsurance({
    grossYen: input.grossYen,
    rates,
    standardRemunerationYen: input.healthStandardRemunerationYen,
    pensionStandardRemunerationYen: input.pensionStandardRemunerationYen,
  });
  const salaryIncomeDeduction = computeSalaryIncomeDeduction(
    input.grossYen - social.employee_total_yen,
    rates
  );
  const withholding = computeWithholding({
    grossYen: input.grossYen,
    socialEmployeeYen: social.employee_total_yen,
    dependents: input.dependents,
    rates,
  });
  const netPay = input.grossYen - withholding.withholdingYen - social.employee_total_yen;
  return {
    month: input.month,
    gross_yen: input.grossYen,
    salary_income_deduction_yen: salaryIncomeDeduction,
    taxable_salary_income_yen: withholding.taxableSalaryIncomeYen,
    withholding_yen: withholding.withholdingYen,
    social_insurance: social,
    net_pay_yen: netPay,
  };
}
