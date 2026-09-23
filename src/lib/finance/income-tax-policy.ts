/**
 * Published quick-calculation table for individual income tax and the reconstruction surtax.
 * Rates live only here. Basic deduction is not applied. This is not an e-Tax payload.
 */
import { assertJapaneseFinanceEngine } from "./jp-engine-guard.js";

export const JP_INCOME_TAX_POLICY = {
  id: "jp-income-tax-advisor-2026",
  taxable_income_unit_yen: 1_000,
  payable_floor_yen: 100,
  reconstruction_rate: { numerator: 21, denominator: 1_000 },
  brackets: [
    { up_to_yen: 1_950_000, numerator: 5, denominator: 100, deduction_yen: 0 },
    { up_to_yen: 3_300_000, numerator: 10, denominator: 100, deduction_yen: 97_500 },
    { up_to_yen: 6_950_000, numerator: 20, denominator: 100, deduction_yen: 427_500 },
    { up_to_yen: 9_000_000, numerator: 23, denominator: 100, deduction_yen: 636_000 },
    { up_to_yen: 18_000_000, numerator: 33, denominator: 100, deduction_yen: 1_536_000 },
    { up_to_yen: 40_000_000, numerator: 40, denominator: 100, deduction_yen: 2_796_000 },
    { up_to_yen: null, numerator: 45, denominator: 100, deduction_yen: 4_796_000 },
  ],
} as const;

export const BLUE_RETURN_DEDUCTION_CAP_YEN = {
  standard: 550_000,
  electronic: 650_000,
} as const;

export type IncomeTaxAmountInput = {
  businessIncomeAfterBlueYen: number;
  otherIncomeYen: number | null;
  deductionsYen: number | null;
  creditsYen: number | null;
  withholdingYen: number | null;
  prepaymentYen: number | null;
};

export type IncomeTaxAmounts = {
  other_income_yen: number;
  income_deductions_yen: number;
  taxable_before_thousand_floor_yen: number;
  taxable_yen: number;
  income_tax_before_floor_yen: number;
  credits_yen: number;
  income_tax_yen: number;
  reconstruction_yen: number;
  withholding_yen: number;
  prepayment_yen: number;
  remaining_yen: number;
  payable_yen: number;
};

export type IncomeTaxAmountResult =
  { ok: false; errors: string[] } | ({ ok: true } & IncomeTaxAmounts);

export function floorTaxableIncomeYen(amountYen: number): number {
  if (amountYen <= 0) return 0;
  const unit = JP_INCOME_TAX_POLICY.taxable_income_unit_yen;
  return Math.floor(amountYen / unit) * unit;
}

export function floorPayableYen(amountYen: number): number {
  const unit = JP_INCOME_TAX_POLICY.payable_floor_yen;
  if (amountYen <= 0) return amountYen;
  return Math.floor(amountYen / unit) * unit;
}

function bracketTaxYen(taxableYen: number): number {
  const bracket =
    JP_INCOME_TAX_POLICY.brackets.find(
      (row) => row.up_to_yen == null || taxableYen <= row.up_to_yen
    ) ?? JP_INCOME_TAX_POLICY.brackets[JP_INCOME_TAX_POLICY.brackets.length - 1];
  const raw =
    Math.floor((taxableYen * bracket.numerator) / bracket.denominator) - bracket.deduction_yen;
  return Math.max(0, raw);
}

export function calculateSolePropIncomeTaxAmounts(
  input: IncomeTaxAmountInput
): IncomeTaxAmountResult {
  assertJapaneseFinanceEngine();
  const errors: string[] = [];
  if (input.otherIncomeYen == null) errors.push("other income missing");
  if (input.deductionsYen == null) errors.push("deductions missing");
  if (input.creditsYen == null) errors.push("credits missing");
  if (input.withholdingYen == null) errors.push("withholding missing");
  if (input.prepaymentYen == null) errors.push("prepayment missing");
  if (
    errors.length > 0 ||
    input.otherIncomeYen == null ||
    input.deductionsYen == null ||
    input.creditsYen == null ||
    input.withholdingYen == null ||
    input.prepaymentYen == null
  ) {
    return { ok: false, errors };
  }

  const taxableBefore = Math.max(
    0,
    input.businessIncomeAfterBlueYen + input.otherIncomeYen - input.deductionsYen
  );
  const taxableYen = floorTaxableIncomeYen(taxableBefore);
  const bracket = bracketTaxYen(taxableYen);
  if (input.creditsYen > bracket) return { ok: false, errors: ["credits exceed income tax"] };
  const beforeFloor = bracket - input.creditsYen;
  const incomeTaxYen = beforeFloor;
  const reconstructionYen = Math.floor(
    (incomeTaxYen * JP_INCOME_TAX_POLICY.reconstruction_rate.numerator) /
      JP_INCOME_TAX_POLICY.reconstruction_rate.denominator
  );
  const remainingYen =
    incomeTaxYen + reconstructionYen - input.withholdingYen - input.prepaymentYen;
  return {
    ok: true,
    other_income_yen: input.otherIncomeYen,
    income_deductions_yen: input.deductionsYen,
    taxable_before_thousand_floor_yen: taxableBefore,
    taxable_yen: taxableYen,
    income_tax_before_floor_yen: beforeFloor,
    credits_yen: input.creditsYen,
    income_tax_yen: incomeTaxYen,
    reconstruction_yen: reconstructionYen,
    withholding_yen: input.withholdingYen,
    prepayment_yen: input.prepaymentYen,
    remaining_yen: remainingYen,
    payable_yen: floorPayableYen(remainingYen),
  };
}
