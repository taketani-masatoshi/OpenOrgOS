/**
 * National corporate tax amount helpers for tax-adjustment worksheets.
 */
import {
  CAPITAL_REDUCED_RATE_CEILING_YEN,
  EXPLICIT_ADD_ROWS,
  EXPLICIT_SUBTRACT_ROWS,
  FULL_YEAR_MONTHS,
  HUNDRED_YEN,
  REDUCED_BRACKET_YEN,
  REDUCED_RATE_BPS,
  SME_CATEGORY,
  STANDARD_RATE_BPS,
  THOUSAND_YEN,
  truncateYen,
  type TaxAdjustmentKind,
} from "./corporate-tax-annex.js";

export type CorporateTaxProfile = {
  entertainment_account_code?: string;
  entertainment_cap_yen?: number;
  capital_stock?: number | "TBD";
  category?: string;
  reduced_rate_excluded?: boolean;
};

export type ProfileFiscalYear = {
  period_from?: string;
  period_to?: string;
};

export type NationalCorporateTax = {
  corporate_tax_yen: number | null;
  reduced_rate: boolean | null;
  reduced_base_yen: number | null;
  reduced_tax_yen: number | null;
  residual_base_yen: number | null;
  residual_tax_yen: number | null;
};

export function taxAtRate(baseYen: number, rateBps: number): number {
  return Math.floor((baseYen * rateBps) / 10_000);
}

export function calendarMonths(fromIso: string, toIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso))
    return null;
  if (toIso < fromIso) return null;
  const [startYear, startMonth, startDay] = fromIso.split("-").map(Number);
  const [endYear, endMonth, endDay] = toIso.split("-").map(Number);
  if (
    startYear == null ||
    startMonth == null ||
    startDay == null ||
    endYear == null ||
    endMonth == null ||
    endDay == null
  ) {
    return null;
  }
  let months = (endYear - startYear) * 12 + (endMonth - startMonth);
  if (endDay >= startDay) months += 1;
  if (months < 1) return null;
  return Math.min(months, FULL_YEAR_MONTHS);
}

export function reducedBracketYen(
  fiscalYear: ProfileFiscalYear | undefined,
  companyStart: string,
  companyEnd: string,
): number {
  const declared =
    fiscalYear?.period_from && fiscalYear.period_to
      ? calendarMonths(fiscalYear.period_from, fiscalYear.period_to)
      : null;
  const months =
    declared ?? calendarMonths(companyStart, companyEnd) ?? FULL_YEAR_MONTHS;
  return Math.floor((REDUCED_BRACKET_YEN * months) / FULL_YEAR_MONTHS);
}

export function explicitRowAllowed(
  kind: TaxAdjustmentKind,
  formRow: string | undefined,
): boolean {
  if (!formRow) return false;
  if (kind === "add") return EXPLICIT_ADD_ROWS.has(formRow);
  return EXPLICIT_SUBTRACT_ROWS.has(formRow);
}

export function emptyNationalTax(): NationalCorporateTax {
  return {
    corporate_tax_yen: null,
    reduced_rate: null,
    reduced_base_yen: null,
    reduced_tax_yen: null,
    residual_base_yen: null,
    residual_tax_yen: null,
  };
}

export function reducedRateApplies(
  profile: CorporateTaxProfile,
): boolean | null {
  if (profile.reduced_rate_excluded) return null;
  if (typeof profile.capital_stock === "number") {
    return profile.capital_stock <= CAPITAL_REDUCED_RATE_CEILING_YEN;
  }
  if (profile.category === SME_CATEGORY) return true;
  return null;
}

export function nationalCorporateTax(
  taxableIncomeYen: number,
  reducedRate: boolean | null,
  bracketYen: number,
  excluded: boolean,
): NationalCorporateTax {
  const base = truncateYen(Math.max(0, taxableIncomeYen), THOUSAND_YEN);
  if (base === 0) {
    return {
      corporate_tax_yen: 0,
      reduced_rate: reducedRate,
      reduced_base_yen: 0,
      reduced_tax_yen: 0,
      residual_base_yen: 0,
      residual_tax_yen: 0,
    };
  }
  if (excluded || reducedRate == null) return emptyNationalTax();
  const reducedBase = reducedRate ? Math.min(base, bracketYen) : 0;
  const residualBase = base - reducedBase;
  const reducedRateBps = reducedRate ? REDUCED_RATE_BPS : STANDARD_RATE_BPS;
  let reducedTax = reducedRate ? taxAtRate(reducedBase, reducedRateBps) : 0;
  let residualTax = taxAtRate(residualBase, STANDARD_RATE_BPS);
  const corporateTax = truncateYen(reducedTax + residualTax, HUNDRED_YEN);
  const discarded = reducedTax + residualTax - corporateTax;
  if (discarded > 0 && residualTax >= discarded) residualTax -= discarded;
  else if (discarded > 0) {
    reducedTax -= discarded - residualTax;
    residualTax = 0;
  }
  return {
    corporate_tax_yen: corporateTax,
    reduced_rate: reducedRate,
    reduced_base_yen: reducedBase,
    reduced_tax_yen: reducedTax,
    residual_base_yen: residualBase,
    residual_tax_yen: residualTax,
  };
}
