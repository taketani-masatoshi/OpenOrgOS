import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir, ROOT_DIR } from "../utils.js";

const bracketSchema = z.object({
  up_to_yen: z.number().positive(),
  rate_pct: z.number().nonnegative().optional(),
  minus_yen: z.number().nonnegative().optional(),
  fixed_yen: z.number().nonnegative().optional(),
});

const payrollRatesSchema = z.object({
  version: z.literal(1),
  fiscal_year: z.string().optional(),
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
        }),
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

function resolveBracketAmount(
  amount: number,
  brackets: z.output<typeof bracketSchema>[],
): number {
  const sorted = [...brackets].sort((a, b) => a.up_to_yen - b.up_to_yen);
  const bracket = sorted.find((row) => amount <= row.up_to_yen) ?? sorted.at(-1)!;
  if (typeof bracket.fixed_yen === "number") {
    return bracket.fixed_yen;
  }
  const rate = bracket.rate_pct ?? 0;
  const minus = bracket.minus_yen ?? 0;
  return Math.max(0, Math.floor((amount * rate) / 100 - minus));
}

function fiscalYearFileSuffix(fiscalYear: string): string {
  const upper = fiscalYear.toUpperCase();
  return upper.startsWith("FY") ? upper.slice(2) : upper;
}

export function loadPayrollRates(fiscalYear = "FY2026"): PayrollRates {
  const suffix = fiscalYearFileSuffix(fiscalYear);
  const tenantPath = join(getDataDir(), "finance", `payroll-rates-${suffix}.yaml`);
  const seedPath = join(
    ROOT_DIR,
    "steward/jurisdiction-packs/JP/modules/jp_payroll/seed",
    `payroll-rates-${suffix}.yaml.example`,
  );
  const path = existsSync(tenantPath) ? tenantPath : seedPath;
  if (!existsSync(path)) {
    throw new Error(`Payroll rates file not found for ${fiscalYear}`);
  }
  return payrollRatesSchema.parse(
    YAML.parse(readFileSync(path, "utf-8")) as unknown,
  );
}

export function resolveStandardRemuneration(
  grossYen: number,
  rates: PayrollRates = loadPayrollRates(),
): number {
  const grade =
    rates.social_insurance.standard_remuneration_grades.find(
      (row) => grossYen >= row.lower_yen && grossYen <= row.upper_yen,
    ) ?? rates.social_insurance.standard_remuneration_grades.at(-1)!;
  return grade.monthly_yen;
}

export function computeSocialInsurance(input: {
  grossYen: number;
  standardRemunerationYen?: number;
  rates?: PayrollRates;
}): SocialInsuranceBreakdown {
  const rates = input.rates ?? loadPayrollRates();
  const standard =
    input.standardRemunerationYen ?? resolveStandardRemuneration(input.grossYen, rates);
  const si = rates.social_insurance;
  const healthEmployee = Math.floor((standard * si.health_employee_rate_pct) / 100);
  const healthEmployer = Math.floor((standard * si.health_employer_rate_pct) / 100);
  const pensionEmployee = Math.floor((standard * si.pension_employee_rate_pct) / 100);
  const pensionEmployer = Math.floor((standard * si.pension_employer_rate_pct) / 100);
  const employmentEmployee = Math.floor(
    (input.grossYen * si.employment_employee_rate_pct) / 100,
  );
  const employmentEmployer = Math.floor(
    (input.grossYen * si.employment_employer_rate_pct) / 100,
  );
  const employeeTotal =
    healthEmployee + pensionEmployee + employmentEmployee;
  const employerTotal =
    healthEmployer + pensionEmployer + employmentEmployer;
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

export function computeSalaryIncomeDeduction(
  grossYen: number,
  rates: PayrollRates = loadPayrollRates(),
): number {
  return resolveBracketAmount(grossYen, rates.salary_income_deduction);
}

export function computeWithholding(input: {
  grossYen: number;
  socialEmployeeYen: number;
  dependents?: number;
  rates?: PayrollRates;
}): { taxableSalaryIncomeYen: number; withholdingYen: number } {
  const rates = input.rates ?? loadPayrollRates();
  const dependents = input.dependents ?? 0;
  const salaryDeduction = computeSalaryIncomeDeduction(input.grossYen, rates);
  const taxable = Math.max(
    0,
    input.grossYen -
      salaryDeduction -
      input.socialEmployeeYen -
      rates.basic_deduction_monthly_yen -
      dependents * rates.dependent_deduction_monthly_yen,
  );
  const withholding = resolveBracketAmount(taxable, rates.income_tax_brackets);
  return {
    taxableSalaryIncomeYen: taxable,
    withholdingYen: withholding,
  };
}

export function computePayrollMonth(input: {
  month: string;
  grossYen: number;
  dependents?: number;
  rates?: PayrollRates;
}): PayrollMonthResult {
  const rates = input.rates ?? loadPayrollRates();
  const social = computeSocialInsurance({ grossYen: input.grossYen, rates });
  const salaryIncomeDeduction = computeSalaryIncomeDeduction(input.grossYen, rates);
  const withholding = computeWithholding({
    grossYen: input.grossYen,
    socialEmployeeYen: social.employee_total_yen,
    dependents: input.dependents,
    rates,
  });
  const netPay =
    input.grossYen - withholding.withholdingYen - social.employee_total_yen;
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
