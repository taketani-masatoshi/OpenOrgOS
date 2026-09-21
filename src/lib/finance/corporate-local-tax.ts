import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  corporateLocalTaxCalculationSchema,
  corporateLocalTaxRateProfileSchema,
  type CorporateLocalTaxCalculation,
  type CorporateLocalTaxRateProfile,
} from "../../../schemas/finance/corporate-local-tax.js";

const floor100 = (value: number) => Math.floor(value / 100) * 100;
const applyBps = (value: number, bps: number) => floor100((value * bps) / 10_000);
const trustedCatalogMarker = Symbol("verified corporate local tax catalog");
const trustedCatalogSchema = z.object({
  schema: z.literal("orgos.jp.corporate-local-tax-trusted-catalog.v1"),
  entries: z.array(z.object({ profile_id: z.string().min(1), source_sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
});
export type TrustedCorporateLocalTaxCatalog = z.output<typeof trustedCatalogSchema> & { [trustedCatalogMarker]: true };

export function loadTrustedCorporateLocalTaxCatalog(path: string, expectedSha256: string): TrustedCorporateLocalTaxCatalog {
  const bytes = readFileSync(path);
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) throw new Error("trusted local-tax catalog hash mismatch");
  return Object.assign(trustedCatalogSchema.parse(JSON.parse(bytes.toString("utf8"))), { [trustedCatalogMarker]: true as const });
}

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
  sourceDocumentPath: string;
  trustedProfileIds: readonly string[];
  trustedCatalog?: TrustedCorporateLocalTaxCatalog;
  production?: boolean;
  fiscalYearEnd: string;
  nationalCorporateTaxYen: number;
  taxableIncomeYen: number;
  operationalScope?: { officeCount?: number; externalStandardTaxation?: boolean; lossCarryforwardYen?: number; interimFiling?: boolean };
}): CorporateLocalTaxCalculation {
  const profile = corporateLocalTaxRateProfileSchema.parse(input.profile);
  if (input.production && input.trustedCatalog?.[trustedCatalogMarker] !== true) throw new Error("production local-tax calculation requires a hash-pinned trusted catalog");
  const catalogEntry = input.trustedCatalog?.entries.find((entry) => entry.profile_id === profile.id);
  if (input.trustedCatalog && catalogEntry?.source_sha256 !== profile.source_sha256) throw new Error("local-tax profile source is not pinned by the trusted catalog");
  if (!catalogEntry && !input.trustedProfileIds.includes(profile.id)) throw new Error("corporate local tax rate profile is not in the trusted catalog");
  if (!existsSync(input.sourceDocumentPath)) throw new Error("corporate local tax source document is missing");
  const sourceHash = createHash("sha256").update(readFileSync(input.sourceDocumentPath)).digest("hex");
  if (sourceHash !== profile.source_sha256) throw new Error("corporate local tax source document hash mismatch");
  const scope = input.operationalScope ?? {};
  if ((scope.officeCount ?? 1) !== 1) throw new Error("multiple-office apportionment is not implemented");
  if (scope.externalStandardTaxation) throw new Error("external-standard taxation is not implemented");
  if ((scope.lossCarryforwardYen ?? 0) !== 0) throw new Error("loss carryforward is not implemented");
  if (scope.interimFiling) throw new Error("interim local-tax filing is not implemented");
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

export type CorporateLocalTaxEstablishmentInput = {
  establishmentId: string;
  profile: CorporateLocalTaxRateProfile;
  sourceDocumentPath: string;
  apportionmentWeight: number;
};

/**
 * Multi-establishment filing calculation. Legal classification and the statutory
 * apportionment weight are explicit inputs; this function never guesses them.
 */
export function calculateCorporateLocalTaxReturn(input: {
  establishments: CorporateLocalTaxEstablishmentInput[];
  trustedProfileIds: readonly string[];
  fiscalYearEnd: string;
  nationalCorporateTaxYen: number;
  taxableIncomeBeforeLossYen: number;
  lossCarryforwardYen?: number;
  externalStandardTaxYen?: number;
  interimPaymentsYen?: number;
}): {
  taxableIncomeAfterLossYen: number;
  allocations: Array<{ establishment_id: string; apportioned_income_yen: number; calculation: CorporateLocalTaxCalculation }>;
  assessedTotalYen: number;
  interimPaymentsYen: number;
  filingBalanceYen: number;
} {
  if (input.establishments.length === 0) throw new Error("at least one establishment is required");
  const totalWeight = input.establishments.reduce((sum, row) => sum + row.apportionmentWeight, 0);
  if (!Number.isInteger(totalWeight) || totalWeight <= 0 || input.establishments.some((row) => !Number.isInteger(row.apportionmentWeight) || row.apportionmentWeight <= 0)) {
    throw new Error("statutory apportionment weights must be positive integers");
  }
  const taxable = Math.max(0, input.taxableIncomeBeforeLossYen - (input.lossCarryforwardYen ?? 0));
  let allocated = 0;
  let nationalAllocated = 0;
  const allocations = input.establishments.map((row, index) => {
    const income = index === input.establishments.length - 1
      ? taxable - allocated
      : Math.floor((taxable * row.apportionmentWeight) / totalWeight);
    allocated += income;
    const nationalTax = index === input.establishments.length - 1
      ? input.nationalCorporateTaxYen - nationalAllocated
      : Math.floor((input.nationalCorporateTaxYen * row.apportionmentWeight) / totalWeight);
    nationalAllocated += nationalTax;
    return {
      establishment_id: row.establishmentId,
      apportioned_income_yen: income,
      calculation: calculateCorporateLocalTax({
        profile: row.profile, sourceDocumentPath: row.sourceDocumentPath, trustedProfileIds: input.trustedProfileIds,
        fiscalYearEnd: input.fiscalYearEnd, nationalCorporateTaxYen: nationalTax,
        taxableIncomeYen: income,
      }),
    };
  });
  const assessedTotalYen = allocations.reduce((sum, row) => sum + row.calculation.total_yen, 0) + (input.externalStandardTaxYen ?? 0);
  const interimPaymentsYen = input.interimPaymentsYen ?? 0;
  if (interimPaymentsYen < 0 || (input.externalStandardTaxYen ?? 0) < 0) throw new Error("local-tax adjustments cannot be negative");
  return { taxableIncomeAfterLossYen: taxable, allocations, assessedTotalYen, interimPaymentsYen,
    filingBalanceYen: assessedTotalYen - interimPaymentsYen };
}
