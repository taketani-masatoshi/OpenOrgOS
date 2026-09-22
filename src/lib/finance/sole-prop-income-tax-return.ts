/**
 * Advisor draft of sole-proprietor income tax and the reconstruction surtax.
 * Starts from the blue-return income amount. Does not post journals.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";
import { calculateSolePropIncomeTaxAmounts, basicDeductionYenReiwa7 } from "./income-tax-policy.js";
import { evaluateSolePropIncomeAdjustment } from "./sole-prop-income-adjustment.js";

const amountSchema = z.union([
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("declared"), amount_yen: z.number().int().nonnegative() }),
]);

const fileSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  estimated_tax_yen: z.number().int().nonnegative().optional(),
  other_income: amountSchema,
  deductions: amountSchema,
  credits: amountSchema,
  withholding: amountSchema,
  prepayment: amountSchema,
});

export type SolePropIncomeTaxLine = {
  id: "income" | "deduction" | "taxable_income" | "tax" | "basic_deduction";
  label: string;
  amount_yen: number | null;
};

export type SolePropIncomeTaxReturnDraft = {
  fiscal_year: string;
  ready: boolean;
  submission: "not-for-etax";
  taxpayer_kind: "sole_proprietorship";
  disclaimer: string;
  blockers: string[];
  estimated_tax_yen: number | null;
  business_income_yen: number | null;
  basic_deduction_yen: number | null;
  lines: SolePropIncomeTaxLine[];
  taxable_before_thousand_floor_yen: number | null;
  taxable_yen: number | null;
  income_tax_before_floor_yen: number | null;
  income_tax_yen: number | null;
  reconstruction_yen: number | null;
  remaining_yen: number | null;
  payable_yen: number | null;
};

const DISCLAIMER =
  "この計算は個人事業主の所得税と復興特別所得税の顧問向け試算です。e-Tax には提出しない。法人税の申告でも公式の申告書でもない。";

const AMOUNT_NULLS = {
  business_income_yen: null,
  basic_deduction_yen: null,
  taxable_before_thousand_floor_yen: null,
  taxable_yen: null,
  income_tax_before_floor_yen: null,
  income_tax_yen: null,
  reconstruction_yen: null,
  remaining_yen: null,
  payable_yen: null,
} as const;

function emptyDraft(input: {
  fiscalYear: string;
  blockers: string[];
  estimatedTaxYen: number | null;
}): SolePropIncomeTaxReturnDraft {
  return {
    fiscal_year: input.fiscalYear,
    ready: false,
    submission: "not-for-etax",
    taxpayer_kind: "sole_proprietorship",
    disclaimer: DISCLAIMER,
    blockers: input.blockers.length > 0 ? input.blockers : ["cannot compute"],
    estimated_tax_yen: input.estimatedTaxYen,
    lines: [],
    ...AMOUNT_NULLS,
  };
}

function declaredAmount(row: z.infer<typeof amountSchema>): number {
  return row.status === "none" ? 0 : row.amount_yen;
}

export function buildSolePropIncomeTaxReturnDraft(
  fiscalYear: string,
): SolePropIncomeTaxReturnDraft {
  const worksheet = evaluateSolePropIncomeAdjustment(fiscalYear);
  if (!worksheet.can_compute || worksheet.adjusted_business_income_yen == null) {
    return emptyDraft({
      fiscalYear,
      blockers: worksheet.errors.length > 0 ? worksheet.errors : ["worksheet cannot compute"],
      estimatedTaxYen: null,
    });
  }

  const path = join(getDataDir(), "finance", "income-tax-return.yaml");
  if (!existsSync(path)) {
    return emptyDraft({
      fiscalYear,
      blockers: ["income-tax-return missing"],
      estimatedTaxYen: null,
    });
  }
  const parsed = fileSchema.safeParse(YAML.parse(readFileSync(path, "utf-8")));
  if (!parsed.success) {
    return emptyDraft({
      fiscalYear,
      blockers: ["income-tax-return invalid"],
      estimatedTaxYen: null,
    });
  }
  if (parsed.data.fiscal_year !== fiscalYear) {
    return emptyDraft({
      fiscalYear,
      blockers: ["income-tax-return fiscal year mismatch"],
      estimatedTaxYen: parsed.data.estimated_tax_yen ?? null,
    });
  }

  const otherIncome = declaredAmount(parsed.data.other_income);
  const declaredDeductions = declaredAmount(parsed.data.deductions);
  const totalIncome = worksheet.adjusted_business_income_yen + otherIncome;
  const basicDeduction = basicDeductionYenReiwa7(totalIncome);
  const amounts = calculateSolePropIncomeTaxAmounts({
    businessIncomeAfterBlueYen: worksheet.adjusted_business_income_yen,
    otherIncomeYen: otherIncome,
    deductionsYen: declaredDeductions + basicDeduction,
    creditsYen: declaredAmount(parsed.data.credits),
    withholdingYen: declaredAmount(parsed.data.withholding),
    prepaymentYen: declaredAmount(parsed.data.prepayment),
  });
  if (!amounts.ok) {
    return emptyDraft({
      fiscalYear,
      blockers: amounts.errors,
      estimatedTaxYen: parsed.data.estimated_tax_yen ?? null,
    });
  }

  const lines: SolePropIncomeTaxLine[] = [
    { id: "income", label: "所得金額", amount_yen: totalIncome },
    { id: "basic_deduction", label: "基礎控除", amount_yen: basicDeduction },
    { id: "deduction", label: "所得控除", amount_yen: amounts.income_deductions_yen },
    { id: "taxable_income", label: "課税される所得金額", amount_yen: amounts.taxable_yen },
    { id: "tax", label: "所得税額", amount_yen: amounts.income_tax_yen },
  ];

  return {
    fiscal_year: fiscalYear,
    ready: true,
    submission: "not-for-etax",
    taxpayer_kind: "sole_proprietorship",
    disclaimer: DISCLAIMER,
    blockers: [],
    estimated_tax_yen: parsed.data.estimated_tax_yen ?? null,
    business_income_yen: worksheet.adjusted_business_income_yen,
    basic_deduction_yen: basicDeduction,
    lines,
    taxable_before_thousand_floor_yen: amounts.taxable_before_thousand_floor_yen,
    taxable_yen: amounts.taxable_yen,
    income_tax_before_floor_yen: amounts.income_tax_before_floor_yen,
    income_tax_yen: amounts.income_tax_yen,
    reconstruction_yen: amounts.reconstruction_yen,
    remaining_yen: amounts.remaining_yen,
    payable_yen: amounts.payable_yen,
  };
}
