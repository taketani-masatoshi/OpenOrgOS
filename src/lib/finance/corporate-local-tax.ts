import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
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

export function loadTrustedCorporateLocalTaxCatalog(path: string, signaturePath: string): TrustedCorporateLocalTaxCatalog {
  const bytes = readFileSync(path);
  const publicKeyPem = process.env.ORGOS_LOCAL_TAX_CATALOG_PUBLIC_KEY_PEM;
  if (!publicKeyPem) throw new Error("local-tax catalog trust root is not configured");
  const signature = readFileSync(signaturePath);
  if (!verifySignature("sha256", bytes, createPublicKey(publicKeyPem), signature)) throw new Error("trusted local-tax catalog signature mismatch");
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
  apportionment: {
    enterpriseIncome: StatutoryApportionmentWeight;
    prefecturalResidentTax: StatutoryApportionmentWeight;
    municipalResidentTax: StatutoryApportionmentWeight;
  };
};

export type StatutoryApportionmentWeight = {
  criterion: string;
  weight: number;
  evidencePath: string;
  evidenceSha256: string;
};

export type VerifiedLocalTaxAmount = {
  amountYen: number;
  fiscalYearEnd: string;
  evidencePath: string;
  evidenceSha256: string;
  ledgerEvidencePath: string;
  ledgerEvidenceSha256: string;
  approvedBy: string;
  approvedAt: string;
};

function verifyEvidence(path: string, expectedHash: string, label: string): void {
  if (!existsSync(path)) throw new Error(`${label} evidence is missing`);
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expectedHash) throw new Error(`${label} evidence hash mismatch`);
}

function verifiedAmount(value: VerifiedLocalTaxAmount | undefined, fiscalYearEnd: string, label: string): number {
  if (!value) return 0;
  if (!Number.isInteger(value.amountYen) || value.amountYen < 0) throw new Error(`${label} amount must be a non-negative integer`);
  if (value.fiscalYearEnd !== fiscalYearEnd) throw new Error(`${label} fiscal year mismatch`);
  if (!value.approvedBy.trim() || !Number.isFinite(Date.parse(value.approvedAt))) throw new Error(`${label} approval evidence is invalid`);
  verifyEvidence(value.evidencePath, value.evidenceSha256, label);
  verifyEvidence(value.ledgerEvidencePath, value.ledgerEvidenceSha256, `${label} ledger`);
  return value.amountYen;
}

function allocate(total: number, rows: CorporateLocalTaxEstablishmentInput[], select: (row: CorporateLocalTaxEstablishmentInput) => StatutoryApportionmentWeight, label: string): number[] {
  const weights = rows.map(select);
  for (const value of weights) {
    if (!value.criterion.trim() || !Number.isInteger(value.weight) || value.weight <= 0) throw new Error(`${label} statutory weights must be positive integers with a criterion`);
    verifyEvidence(value.evidencePath, value.evidenceSha256, `${label} apportionment`);
  }
  const totalWeight = weights.reduce((sum, value) => sum + value.weight, 0);
  let allocated = 0;
  return weights.map((value, index) => {
    const amount = index === weights.length - 1 ? total - allocated : Math.floor((total * value.weight) / totalWeight);
    allocated += amount;
    return amount;
  });
}

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
  lossCarryforward?: VerifiedLocalTaxAmount;
  externalStandardTax?: VerifiedLocalTaxAmount;
  interimPayments?: VerifiedLocalTaxAmount[];
}): {
  taxableIncomeAfterLossYen: number;
  allocations: Array<{ establishment_id: string; apportioned_income_yen: number; prefectural_tax_base_yen: number; municipal_tax_base_yen: number; calculation: CorporateLocalTaxCalculation }>;
  assessedTotalYen: number;
  interimPaymentsYen: number;
  filingBalanceYen: number;
} {
  if (input.establishments.length === 0) throw new Error("at least one establishment is required");
  const loss = verifiedAmount(input.lossCarryforward, input.fiscalYearEnd, "loss carryforward");
  if (loss > input.taxableIncomeBeforeLossYen) throw new Error("loss carryforward exceeds taxable income before loss");
  const external = verifiedAmount(input.externalStandardTax, input.fiscalYearEnd, "external-standard tax");
  const interimPaymentsYen = (input.interimPayments ?? []).reduce((sum, row) => sum + verifiedAmount(row, input.fiscalYearEnd, "interim payment"), 0);
  const taxable = Math.max(0, input.taxableIncomeBeforeLossYen - loss);
  const incomeAllocations = allocate(taxable, input.establishments, (row) => row.apportionment.enterpriseIncome, "enterprise income");
  const prefecturalBases = allocate(input.nationalCorporateTaxYen, input.establishments, (row) => row.apportionment.prefecturalResidentTax, "prefectural resident tax");
  const municipalBases = allocate(input.nationalCorporateTaxYen, input.establishments, (row) => row.apportionment.municipalResidentTax, "municipal resident tax");
  const allocations = input.establishments.map((row, index) => {
    const income = incomeAllocations[index]!;
    const prefecturalBase = prefecturalBases[index]!;
    const municipalBase = municipalBases[index]!;
    const enterprise = enterpriseTax(income, row.profile.enterprise_tax_brackets);
    const prefectural = applyBps(prefecturalBase, row.profile.resident_tax.prefectural_corporate_tax_bps);
    const municipal = applyBps(municipalBase, row.profile.resident_tax.municipal_corporate_tax_bps);
    const special = applyBps(enterprise, row.profile.special_corporate_business_tax_bps);
    const calculationBase = {
      schema: "orgos.jp.corporate-local-tax-calculation.v1" as const, profile_id: row.profile.id,
      municipality_code: row.profile.municipality_code, fiscal_year_end: input.fiscalYearEnd,
      national_corporate_tax_yen: municipalBase, taxable_income_yen: income,
      prefectural_corporate_tax_base_yen: prefecturalBase,
      municipal_corporate_tax_base_yen: municipalBase,
      prefectural_resident_tax_yen: prefectural, municipal_resident_tax_yen: municipal,
      per_capita_tax_yen: row.profile.resident_tax.per_capita_yen, enterprise_tax_yen: enterprise,
      special_corporate_business_tax_yen: special,
      total_yen: prefectural + municipal + row.profile.resident_tax.per_capita_yen + enterprise + special,
    };
    calculateCorporateLocalTax({ profile: row.profile, sourceDocumentPath: row.sourceDocumentPath, trustedProfileIds: input.trustedProfileIds,
      fiscalYearEnd: input.fiscalYearEnd, nationalCorporateTaxYen: municipalBase, taxableIncomeYen: income });
    const calculation = corporateLocalTaxCalculationSchema.parse({ ...calculationBase,
      calculation_sha256: createHash("sha256").update(JSON.stringify(calculationBase)).digest("hex") });
    return {
      establishment_id: row.establishmentId,
      apportioned_income_yen: income,
      prefectural_tax_base_yen: prefecturalBase,
      municipal_tax_base_yen: municipalBase,
      calculation,
    };
  });
  const assessedTotalYen = allocations.reduce((sum, row) => sum + row.calculation.total_yen, 0) + external;
  return { taxableIncomeAfterLossYen: taxable, allocations, assessedTotalYen, interimPaymentsYen,
    filingBalanceYen: assessedTotalYen - interimPaymentsYen };
}
