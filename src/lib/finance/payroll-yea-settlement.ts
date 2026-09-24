/**
 * Employment year-end withholding settlement (年末調整の還付・追徴見積).
 * Builds 給与所得 → 課税所得 → 所得税+復興税 using the employment income path.
 * Does not e-file. Settlement journals are posted only via postYearEndSettlements.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";
import { computeJpIncomeTaxOnTaxableBase } from "./income-tax-policy.js";
import { assertJapaneseFinanceEngine } from "./jp-engine-guard.js";

const yen = z.number().int().nonnegative().safe();

const declarationSchema = z.object({
  version: z.literal(1),
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  employees: z
    .array(
      z.object({
        employee_id: z.string().min(1),
        /** 給与所得控除以外の所得控除合計（基礎控除・扶養等の明示合計）。 */
        income_deductions_yen: yen,
        /** 税額控除（明示）。なければ 0。 */
        tax_credits_yen: yen,
        /** 給与以外の所得。なければ 0。 */
        other_income_yen: yen,
      })
    )
    .min(1),
});

export type YeaDeclaration = z.output<typeof declarationSchema>;

export type AnnualSalarySettlementInput = {
  fiscalYear: string;
  employeeId: string;
  annualGrossYen: number;
  socialEmployeeTotalYen: number;
  withholdingTotalYen: number;
  incomeDeductionsYen: number;
  taxCreditsYen: number;
  otherIncomeYen: number;
};

export type AnnualSalarySettlement = {
  employee_id: string;
  salary_income_yen: number;
  salary_income_deduction_yen: number;
  taxable_yen: number;
  annual_tax_yen: number;
  withholding_total_yen: number;
  /** Positive = 追徴, negative = 還付. Ledger amounts only until posted. */
  yea_settlement_yen: number;
};

/** NTA 給与所得控除（令和2年分以後の年額表）。 */
export function computeAnnualSalaryIncomeDeduction(salaryAfterSocialYen: number): number {
  if (!Number.isSafeInteger(salaryAfterSocialYen) || salaryAfterSocialYen < 0) {
    throw new Error("Invalid annual salary for income deduction");
  }
  if (salaryAfterSocialYen <= 1_625_000) return 550_000;
  if (salaryAfterSocialYen <= 1_800_000) return Math.floor(salaryAfterSocialYen * 0.4) - 100_000;
  if (salaryAfterSocialYen <= 3_600_000) return Math.floor(salaryAfterSocialYen * 0.3) + 80_000;
  if (salaryAfterSocialYen <= 6_600_000) return Math.floor(salaryAfterSocialYen * 0.2) + 440_000;
  if (salaryAfterSocialYen <= 8_500_000) return Math.floor(salaryAfterSocialYen * 0.1) + 1_100_000;
  return 1_950_000;
}

export function yeaDeclarationPath(fiscalYear: string): string {
  return join(getDataDir(), "finance", "yea-declarations", `${fiscalYear}.yaml`);
}

export function readYeaDeclaration(fiscalYear: string): YeaDeclaration | null {
  const path = yeaDeclarationPath(fiscalYear);
  if (!existsSync(path)) return null;
  const parsed = declarationSchema.parse(YAML.parse(readFileSync(path, "utf8")));
  if (parsed.fiscal_year !== fiscalYear) throw new Error("YEA declaration fiscal year mismatch");
  return parsed;
}

/**
 * Employment YEA settlement estimate from annual gross, employee social insurance,
 * explicit deductions/credits, and recorded withholding — not a sole-prop worksheet.
 */
export function computeAnnualSalarySettlement(
  input: AnnualSalarySettlementInput
): AnnualSalarySettlement {
  assertJapaneseFinanceEngine();
  if (
    ![
      input.annualGrossYen,
      input.socialEmployeeTotalYen,
      input.withholdingTotalYen,
      input.incomeDeductionsYen,
      input.taxCreditsYen,
      input.otherIncomeYen,
    ].every((n) => Number.isSafeInteger(n) && n >= 0)
  ) {
    throw new Error("Invalid annual salary settlement inputs");
  }
  if (input.socialEmployeeTotalYen > input.annualGrossYen) {
    throw new Error("Annual social insurance exceeds gross");
  }
  const afterSocial = input.annualGrossYen - input.socialEmployeeTotalYen;
  const salaryDeduction = computeAnnualSalaryIncomeDeduction(afterSocial);
  const salaryIncome = Math.max(0, afterSocial - salaryDeduction);
  const taxableBefore = Math.max(
    0,
    salaryIncome + input.otherIncomeYen - input.incomeDeductionsYen
  );
  const tax = computeJpIncomeTaxOnTaxableBase({
    taxableBeforeFloorYen: taxableBefore,
    creditsYen: input.taxCreditsYen,
  });
  return {
    employee_id: input.employeeId,
    salary_income_yen: salaryIncome,
    salary_income_deduction_yen: salaryDeduction,
    taxable_yen: tax.taxable_yen,
    annual_tax_yen: tax.annual_tax_yen,
    withholding_total_yen: input.withholdingTotalYen,
    yea_settlement_yen: tax.annual_tax_yen - input.withholdingTotalYen,
  };
}
