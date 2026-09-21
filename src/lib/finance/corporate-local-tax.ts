import { createHash } from "node:crypto";
import {
  corporateLocalTaxCalculationSchema,
  corporateLocalTaxRateProfileSchema,
  type CorporateLocalTaxCalculation,
  type CorporateLocalTaxRateProfile,
} from "../../../schemas/finance/corporate-local-tax.js";

const floor100 = (value: number) => Math.floor(value / 100) * 100;
const applyBps = (value: number, bps: number) => floor100((value * bps) / 10_000);

function enterpriseTax(income: number, brackets: CorporateLocalTaxRateProfile["enterprise_tax_brackets"]): number {
  let lower = 0;
  let tax = 0;
  for (const bracket of brackets) {
    const upper = bracket.up_to_yen ?? income;
    const taxable = Math.max(0, Math.min(income, upper) - lower);
    tax += applyBps(taxable, bracket.rate_bps);
    lower = upper;
    if (income <= upper || bracket.up_to_yen == null) break;
  }
  return tax;
}

/** Rate-data driven calculation. OOO ships no guessed statutory rates. */
export function calculateCorporateLocalTax(input: {
  profile: CorporateLocalTaxRateProfile;
  fiscalYearEnd: string;
  nationalCorporateTaxYen: number;
  taxableIncomeYen: number;
}): CorporateLocalTaxCalculation {
  const profile = corporateLocalTaxRateProfileSchema.parse(input.profile);
  if (input.fiscalYearEnd < profile.effective_from || (profile.effective_to && input.fiscalYearEnd > profile.effective_to)) {
    throw new Error("corporate local tax rate profile is not effective for the fiscal year end");
  }
  const prefectural = applyBps(input.nationalCorporateTaxYen, profile.resident_tax.prefectural_corporate_tax_bps);
  const municipal = applyBps(input.nationalCorporateTaxYen, profile.resident_tax.municipal_corporate_tax_bps);
  const enterprise = enterpriseTax(input.taxableIncomeYen, profile.enterprise_tax_brackets);
  const special = applyBps(enterprise, profile.special_corporate_business_tax_bps);
  const base = {
    schema: "orgos.jp.corporate-local-tax-calculation.v1" as const,
    profile_id: profile.id,
    municipality_code: profile.municipality_code,
    fiscal_year_end: input.fiscalYearEnd,
    national_corporate_tax_yen: input.nationalCorporateTaxYen,
    taxable_income_yen: input.taxableIncomeYen,
    prefectural_resident_tax_yen: prefectural,
    municipal_resident_tax_yen: municipal,
    per_capita_tax_yen: profile.resident_tax.per_capita_yen,
    enterprise_tax_yen: enterprise,
    special_corporate_business_tax_yen: special,
    total_yen: prefectural + municipal + profile.resident_tax.per_capita_yen + enterprise + special,
  };
  const calculation_sha256 = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  return corporateLocalTaxCalculationSchema.parse({ ...base, calculation_sha256 });
}
