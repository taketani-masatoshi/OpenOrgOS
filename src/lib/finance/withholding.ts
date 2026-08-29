/**
 * Withholding / social insurance rough estimates for tax calendar and CEO visibility.
 * Not substitute for payroll software or statutory tables.
 */

/** 源泉概算率（給与総額に対する rough 目安）。 */
export const WITHHOLDING_ROUGH_RATE = 0.1;

/** 社保事業主負担概算率。 */
export const SOCIAL_EMPLOYER_ROUGH_RATE = 0.15;

export type PayrollWithholdingContext = {
  monthly_gross_jpy: number;
  has_withholding: boolean;
  has_social_insurance: boolean;
};

export function estimateWithholdingRough(monthlyGrossJpy: number): number {
  return Math.round(monthlyGrossJpy * WITHHOLDING_ROUGH_RATE);
}

export function estimateSocialEmployerRough(monthlyGrossJpy: number): number {
  return Math.round(monthlyGrossJpy * SOCIAL_EMPLOYER_ROUGH_RATE);
}

export function resolveWithholdingFormulaAmount(
  formula: "payroll_withholding_rough" | "payroll_social_employer_rough",
  payroll: PayrollWithholdingContext,
): number | null {
  if (formula === "payroll_withholding_rough") {
    if (!payroll.has_withholding) return null;
    return estimateWithholdingRough(payroll.monthly_gross_jpy);
  }
  if (formula === "payroll_social_employer_rough") {
    if (!payroll.has_social_insurance) return null;
    return estimateSocialEmployerRough(payroll.monthly_gross_jpy);
  }
  return null;
}
