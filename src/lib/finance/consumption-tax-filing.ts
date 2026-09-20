/** Advisor-reviewable workpaper; never an official return or e-Tax payload. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { loadFixedAssets, loadTaxProfile } from "../data.js";
import { inventoryFileSchema } from "../../../schemas/finance/inventory.js";
import type { FixedAsset } from "../../../schemas/finance/types.js";
import { getDataDir } from "../utils.js";
import { buildConsumptionTaxSummary } from "./consumption-tax.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import { fiscalYearEndDate, fiscalYearStartDate, fiscalYearStartMonth, resolveCompanyFiscalYearEndMonth, resolveFiscalYear } from "./fiscal-year.js";
import { consumptionTaxFilingDraftSchema } from "../../../schemas/finance/consumption-tax-filing.js";
import { JP_CONSUMPTION_TAX_POLICY } from "./consumption-tax-policy.js";
import type { ConsumptionTaxSummary } from "../../../schemas/finance/consumption-tax.js";

function floorTo(value: number, unit: number): number {
  return Math.floor(value / unit) * unit;
}

export function calculateConsumptionTaxFilingAmounts(input: {
  taxable_sales_10_yen: number;
  taxable_sales_8_yen: number;
  deductible_input_tax_yen: number;
  output_tax_adjustment_yen?: number;
  two_tenths_relief?: boolean;
}) {
  const policy = JP_CONSUMPTION_TAX_POLICY;
  const taxableBase10 = floorTo(input.taxable_sales_10_yen, policy.filing_rounding.taxable_base_unit_yen);
  const taxableBase8 = floorTo(input.taxable_sales_8_yen, policy.filing_rounding.taxable_base_unit_yen);
  const nationalOutputBeforeAdjustments =
    Math.floor((taxableBase10 * policy.rates.taxable_10.national_rate_numerator) / policy.rates.taxable_10.national_rate_denominator) +
    Math.floor((taxableBase8 * policy.rates.taxable_8.national_rate_numerator) / policy.rates.taxable_8.national_rate_denominator);
  const nationalAdjustment = Math.floor(
    ((input.output_tax_adjustment_yen ?? 0) * policy.invoice_tax_national_ratio.numerator) /
      policy.invoice_tax_national_ratio.denominator,
  );
  const nationalOutput = nationalOutputBeforeAdjustments - nationalAdjustment;
  let nationalInput = Math.floor(
    (input.deductible_input_tax_yen * policy.invoice_tax_national_ratio.numerator) /
      policy.invoice_tax_national_ratio.denominator,
  );
  if (input.two_tenths_relief) nationalInput = Math.floor(nationalOutput * 0.8);
  const nationalRaw = nationalOutput - nationalInput;
  const nationalTax = nationalRaw >= 0 ? floorTo(nationalRaw, policy.filing_rounding.national_payable_unit_yen) : nationalRaw;
  const localRaw = Math.floor((Math.abs(nationalTax) * policy.local_tax_ratio.numerator) / policy.local_tax_ratio.denominator);
  const localTax = nationalTax >= 0 ? floorTo(localRaw, policy.filing_rounding.local_payable_unit_yen) : -localRaw;
  return {
    taxable_base_10_yen: taxableBase10,
    taxable_base_8_yen: taxableBase8,
    national_output_tax_yen: nationalOutput,
    national_input_tax_yen: nationalInput,
    national_tax_yen: nationalTax,
    local_consumption_tax_yen: localTax,
    combined_tax_yen: nationalTax + localTax,
  };
}

type InterimFrequency = "none" | "annual_1" | "annual_3" | "annual_11";

export function assessSimplifiedTaxEligibility(input: {
  method?: unknown;
  base_period_sales_jpy?: unknown;
  simplified_election_filed_on?: unknown;
  simplified_election_effective_from?: unknown;
  simplified_election_filing_basis?: unknown;
  simplified_election_filing_due_on?: unknown;
  simplified_election_evidence_ref?: unknown;
  taxpayer_basis?: unknown;
  business_operator_kind?: unknown;
  permanent_establishment_in_japan?: unknown;
  periodFrom: string;
  periodTo: string;
  jurisdictionTestDate?: string;
}): string[] {
  if (input.method !== "simplified") return [];
  const blockers: string[] = [];
  if (typeof input.base_period_sales_jpy !== "number") {
    blockers.push("simplified tax requires base-period taxable sales");
  } else if (input.base_period_sales_jpy > 50_000_000) {
    blockers.push("simplified tax is unavailable when base-period taxable sales exceed 50,000,000 yen");
  }
  if (typeof input.simplified_election_filed_on !== "string") {
    blockers.push("simplified tax election filing date missing");
  } else if (input.simplified_election_filed_on > input.periodTo) {
    blockers.push("simplified tax election was filed after the filing period");
  }
  if (typeof input.simplified_election_effective_from !== "string") {
    blockers.push("simplified tax election effective date missing");
  } else if (input.simplified_election_effective_from > input.periodFrom) {
    blockers.push("simplified tax election is not effective at the start of the taxable filing period");
  }
  const filingBasis = input.simplified_election_filing_basis;
  if (!["normal", "invoice_registration_transition", "relief_following_period", "disaster_exception"].includes(String(filingBasis))) {
    blockers.push("simplified tax election filing basis missing");
  } else if (filingBasis === "normal" && typeof input.simplified_election_filed_on === "string" && input.simplified_election_filed_on >= input.periodFrom) {
    blockers.push("normal simplified tax election must be filed before the taxable period starts");
  } else if (filingBasis === "invoice_registration_transition" && input.taxpayer_basis !== "invoice_registration") {
    blockers.push("invoice-registration filing transition requires taxpayer_basis invoice_registration");
  } else if ((filingBasis === "relief_following_period" || filingBasis === "disaster_exception") && typeof input.simplified_election_filing_due_on !== "string") {
    blockers.push("special simplified tax filing basis requires an explicit filing due date");
  }
  if (
    typeof input.simplified_election_filed_on === "string" &&
    typeof input.simplified_election_filing_due_on === "string" &&
    input.simplified_election_filed_on > input.simplified_election_filing_due_on
  ) blockers.push("simplified tax election was filed after its applicable due date");
  if (typeof input.simplified_election_evidence_ref !== "string") blockers.push("simplified tax election evidence missing");
  if (input.business_operator_kind !== "domestic" && input.business_operator_kind !== "foreign") {
    blockers.push("business operator kind missing for simplified tax eligibility");
  } else if (
    input.business_operator_kind === "foreign" &&
    (input.jurisdictionTestDate ?? input.periodFrom) >= "2024-10-01" &&
    input.permanent_establishment_in_japan !== true
  ) {
    blockers.push("foreign business operator without a Japanese permanent establishment cannot use simplified tax");
  }
  return blockers;
}

export function expectedInterimFrequency(priorNationalTax: number, voluntary: boolean): InterimFrequency {
  if (priorNationalTax > 48_000_000) return "annual_11";
  if (priorNationalTax > 4_000_000) return "annual_3";
  if (priorNationalTax > 480_000) return "annual_1";
  return voluntary ? "annual_1" : "none";
}

function lastDayAfterMonths(start: string, months: number): string {
  const date = new Date(`${start}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 0))
    .toISOString().slice(0, 10);
}

function dueDateForPeriod(start: string, periodEnd: string, annual11First: boolean): string {
  if (annual11First) return lastDayAfterMonths(start, 5);
  const date = new Date(`${periodEnd}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 3, 0))
    .toISOString().slice(0, 10);
}

function installmentAmount(priorNationalTax: number, frequency: InterimFrequency): number {
  const numerator = frequency === "annual_1" ? 6 : frequency === "annual_3" ? 3 : 1;
  const national = floorTo(Math.floor((priorNationalTax * numerator) / 12), 100);
  const policy = JP_CONSUMPTION_TAX_POLICY;
  const local = floorTo(
    Math.floor((national * policy.local_tax_ratio.numerator) / policy.local_tax_ratio.denominator),
    policy.filing_rounding.local_payable_unit_yen,
  );
  return national + local;
}

export function buildInterimReconciliation(input: {
  from: string;
  fiscalYear: string;
  priorNationalTax: number;
  configured: InterimFrequency;
  voluntary: boolean;
}) {
  const expected = expectedInterimFrequency(input.priorNationalTax, input.voluntary);
  const count = expected === "none" ? 0 : expected === "annual_1" ? 1 : expected === "annual_3" ? 3 : 11;
  const span = expected === "annual_1" ? 6 : expected === "annual_3" ? 3 : 1;
  const expectedPerPeriod = installmentAmount(input.priorNationalTax, expected);
  const interimEntries = loadJournalEntries().entries.filter(
    (entry) => entry.source?.kind === "remittance" && entry.source.obligation === "consumption_tax" && entry.source.filing_kind === "interim" && entry.source.tax_fiscal_year === input.fiscalYear,
  );
  const periods = Array.from({ length: count }, (_, index) => {
    const end = lastDayAfterMonths(input.from, span * (index + 1));
    const period = end.slice(0, 7);
    const paid = interimEntries
      .filter((entry) => entry.source?.kind === "remittance" && entry.source.period === period)
      .reduce((sum, entry) => sum + entry.lines.reduce((debits, line) => debits + line.debit_yen, 0), 0);
    return {
      period,
      due_on: dueDateForPeriod(input.from, end, expected === "annual_11" && index === 0),
      expected_yen: expectedPerPeriod,
      paid_yen: paid,
      status: paid === 0 ? "unpaid" as const : paid < expectedPerPeriod ? "partial" as const : paid === expectedPerPeriod ? "paid" as const : "overpaid" as const,
    };
  });
  return {
    expected_frequency: expected,
    configured_frequency: input.configured,
    expected_count: count,
    paid_count: periods.filter((period) => period.paid_yen > 0).length,
    expected_yen: periods.reduce((sum, period) => sum + period.expected_yen, 0),
    paid_yen: periods.reduce((sum, period) => sum + period.paid_yen, 0),
    periods,
  };
}

export function isTwoTenthsReliefEligible(input: {
  period_from: string;
  invoice_registered: boolean;
  pre_registration_exempt: boolean;
  shortened_tax_period: boolean;
  base_period_sales_jpy: number | null;
}): boolean {
  return input.period_from >= "2023-10-01" && input.period_from <= "2026-09-30" &&
    input.invoice_registered && input.pre_registration_exempt && !input.shortened_tax_period &&
    input.base_period_sales_jpy != null && input.base_period_sales_jpy <= 10_000_000;
}

export function classifyConsumptionTaxFilingIssues(summaries: ConsumptionTaxSummary[]) {
  const blockers = summaries.flatMap((row) =>
    (row.issues ?? [])
      .filter((issue) => issue.severity === "error" || issue.code === "invoice_status_missing")
      .map((issue) => `${row.period}: ${issue.message}`),
  );
  const warnings = summaries.flatMap((row) =>
    (row.issues ?? [])
      .filter((issue) => issue.severity === "warning" && issue.code !== "invoice_status_missing")
      .map((issue) => `${row.period}: ${issue.message}`),
  );
  return { blockers, warnings };
}

type AnnualAdjustmentProfile = {
  method?: unknown;
  status?: unknown;
  fixed_asset_adjustments?: Array<{
    asset_id: string; adjustment_fiscal_year: string; tax_exclusive_cost_yen: number;
    acquisition_input_tax_yen: number; acquisition_taxable_sales_ratio_pct: number;
    cumulative_taxable_sales_ratio_pct: number; held_at_adjustment_period_end: boolean;
    allocation_method: "proportional"; evidence_ref: string;
  }>;
  inventory_tax_adjustments?: Array<{
    adjustment_fiscal_year: string; direction: "exempt_to_taxable" | "taxable_to_exempt";
    input_tax_yen: number; inventory_record_ref: string;
  }>;
  high_value_assets?: Array<{
    asset_id: string; acquired_on: string; tax_exclusive_cost_yen: number; kind: string;
    restriction_end_fiscal_year: string; evidence_ref: string;
  }>;
  incomplete_assets?: string[];
};

export function assessPurchaseAllocationContinuity(input: {
  currentMethod?: unknown;
  periodFrom: string;
  history?: Array<{ method: "individual" | "proportional"; effective_from: string; evidence_ref: string }>;
}): string[] {
  if (input.currentMethod !== "individual") return [];
  const latestProportional = [...(input.history ?? [])]
    .filter((row) => row.method === "proportional" && row.effective_from <= input.periodFrom)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  if (!latestProportional) return [];
  const eligible = new Date(`${latestProportional.effective_from}T00:00:00Z`);
  eligible.setUTCFullYear(eligible.getUTCFullYear() + 2);
  return input.periodFrom < eligible.toISOString().slice(0, 10)
    ? ["individual allocation cannot replace proportional allocation before the two-year continuity period ends"]
    : [];
}

export function calculateAnnualInputTaxAdjustments(profile: AnnualAdjustmentProfile, fiscalYear: string) {
  const adjustments: Array<{ kind: "fixed_asset_ratio" | "inventory"; reference: string; amount_yen: number }> = [];
  for (const asset of profile.fixed_asset_adjustments ?? []) {
    if (asset.adjustment_fiscal_year !== fiscalYear || !asset.held_at_adjustment_period_end || asset.tax_exclusive_cost_yen < 1_000_000) continue;
    const from = asset.acquisition_taxable_sales_ratio_pct;
    const to = asset.cumulative_taxable_sales_ratio_pct;
    const pointChange = Math.abs(to - from);
    const relativeChange = from === 0 ? (to >= 5 ? Infinity : 0) : Math.abs(to - from) / from;
    if (pointChange < 5 || relativeChange < 0.5) continue;
    adjustments.push({
      kind: "fixed_asset_ratio",
      reference: `${asset.asset_id}:${asset.evidence_ref}`,
      amount_yen: Math.trunc((asset.acquisition_input_tax_yen * (to - from)) / 100),
    });
  }
  for (const inventory of profile.inventory_tax_adjustments ?? []) {
    if (inventory.adjustment_fiscal_year !== fiscalYear) continue;
    adjustments.push({
      kind: "inventory",
      reference: inventory.inventory_record_ref,
      amount_yen: inventory.direction === "exempt_to_taxable" ? inventory.input_tax_yen : -inventory.input_tax_yen,
    });
  }
  return {
    adjustments,
    total_yen: adjustments.reduce((sum, item) => sum + item.amount_yen, 0),
    restricted_assets: (profile.high_value_assets ?? []).filter((asset) => fiscalYear <= asset.restriction_end_fiscal_year),
  };
}

type SalesTotals = { taxable_yen: number; total_yen: number };

function addFiscalYears(fiscalYear: string, years: number): string {
  return `FY${Number(fiscalYear.slice(2)) + years}`;
}

function salesTotalsForFiscalRange(fromFiscalYear: string, toFiscalYear: string, endMonth: number): SalesTotals {
  const from = fiscalYearStartMonth(fromFiscalYear, endMonth);
  const to = fiscalYearEndDate(toFiscalYear, endMonth).slice(0, 7);
  let cursor = from;
  let taxable = 0;
  let total = 0;
  for (let guard = 0; guard < 60 && cursor <= to; guard += 1) {
    const summary = buildConsumptionTaxSummary({ period: cursor, strict: true });
    for (const line of summary.lines.filter((item) => item.direction === "sales")) {
      if (["taxable_10", "taxable_8", "tax_free"].includes(line.tax_category)) taxable += line.base_yen;
      if (["taxable_10", "taxable_8", "tax_free", "exempt"].includes(line.tax_category)) total += line.base_yen;
    }
    const [year, month] = cursor.split("-").map(Number);
    const next = new Date(year!, month!, 1);
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  }
  return { taxable_yen: taxable, total_yen: total };
}

export function deriveLedgerAnnualInputTaxAdjustments(input: {
  fiscalYear: string;
  endMonth: number;
  assets: FixedAsset[];
  inventoryMonths: Array<{ month: string; consumption_tax_adjustment?: { direction: "exempt_to_taxable" | "taxable_to_exempt"; input_tax_yen: number; evidence_ref: string } }>;
  salesTotals?: (fromFiscalYear: string, toFiscalYear: string) => SalesTotals;
}) {
  const fixed_asset_adjustments: NonNullable<AnnualAdjustmentProfile["fixed_asset_adjustments"]> = [];
  const high_value_assets: NonNullable<AnnualAdjustmentProfile["high_value_assets"]> = [];
  const incomplete_assets: string[] = [];
  const adjustmentEnd = fiscalYearEndDate(input.fiscalYear, input.endMonth);
  for (const asset of input.assets) {
    const tax = asset.consumption_tax;
    const acquired = asset.acquisition_date ?? (asset.acquisition_month ? `${asset.acquisition_month}-01` : undefined);
    if (!acquired) continue;
    if (!tax) {
      if (acquired <= adjustmentEnd && asset.consumption_tax_review !== "not_applicable") incomplete_assets.push(asset.id);
      continue;
    }
    const acquisitionFy = resolveFiscalYear(input.endMonth, acquired.slice(0, 7));
    const adjustmentFy = addFiscalYears(acquisitionFy, 3);
    if (tax.tax_exclusive_cost_yen >= 10_000_000 && acquired <= adjustmentEnd) {
      high_value_assets.push({ asset_id: asset.id, acquired_on: acquired, tax_exclusive_cost_yen: tax.tax_exclusive_cost_yen, kind: "fixed_asset", restriction_end_fiscal_year: adjustmentFy, evidence_ref: tax.evidence_ref });
    }
    if (adjustmentFy !== input.fiscalYear || tax.tax_exclusive_cost_yen < 1_000_000) continue;
    const acquisitionTotals = (input.salesTotals ?? ((from, to) => salesTotalsForFiscalRange(from, to, input.endMonth)))(acquisitionFy, acquisitionFy);
    const cumulativeTotals = (input.salesTotals ?? ((from, to) => salesTotalsForFiscalRange(from, to, input.endMonth)))(acquisitionFy, input.fiscalYear);
    const acquisitionRatio = tax.acquisition_taxable_sales_ratio_pct ?? (acquisitionTotals.total_yen > 0 ? (acquisitionTotals.taxable_yen / acquisitionTotals.total_yen) * 100 : 0);
    const cumulativeRatio = cumulativeTotals.total_yen > 0 ? (cumulativeTotals.taxable_yen / cumulativeTotals.total_yen) * 100 : 0;
    fixed_asset_adjustments.push({
      asset_id: asset.id, adjustment_fiscal_year: input.fiscalYear, tax_exclusive_cost_yen: tax.tax_exclusive_cost_yen,
      acquisition_input_tax_yen: tax.acquisition_input_tax_yen, acquisition_taxable_sales_ratio_pct: acquisitionRatio,
      cumulative_taxable_sales_ratio_pct: cumulativeRatio,
      held_at_adjustment_period_end: !asset.disposed_on || asset.disposed_on > adjustmentEnd,
      allocation_method: "proportional", evidence_ref: tax.evidence_ref,
    });
  }
  const endMonthString = fiscalYearEndDate(input.fiscalYear, input.endMonth).slice(0, 7);
  const inventory_tax_adjustments = input.inventoryMonths
    .filter((row) => row.month === endMonthString && row.consumption_tax_adjustment)
    .map((row) => ({ adjustment_fiscal_year: input.fiscalYear, direction: row.consumption_tax_adjustment!.direction, input_tax_yen: row.consumption_tax_adjustment!.input_tax_yen, inventory_record_ref: row.consumption_tax_adjustment!.evidence_ref }));
  return { fixed_asset_adjustments, inventory_tax_adjustments, high_value_assets, incomplete_assets };
}

function loadAutomaticAnnualAdjustmentProfile(fiscalYear: string, endMonth: number): AnnualAdjustmentProfile {
  const inventoryPath = join(getDataDir(), "finance", "inventory.yaml");
  const inventory = existsSync(inventoryPath)
    ? inventoryFileSchema.parse(YAML.parse(readFileSync(inventoryPath, "utf-8")))
    : { version: 1 as const, months: [] };
  return deriveLedgerAnnualInputTaxAdjustments({ fiscalYear, endMonth, assets: loadFixedAssets().assets, inventoryMonths: inventory.months });
}

export function buildConsumptionTaxFilingDraft(fiscalYear: string) {
  if (!/^FY\d{4}$/.test(fiscalYear)) throw new Error("fiscal year FY#### is required");
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const from = fiscalYearStartDate(fiscalYear, endMonth);
  const to = fiscalYearEndDate(fiscalYear, endMonth);
  const blockers: string[] = [];
  const warnings: string[] = [];
  let consumption: (Record<string, unknown> & AnnualAdjustmentProfile) | undefined;
  try { consumption = (loadTaxProfile() as { consumption_tax?: Record<string, unknown> & AnnualAdjustmentProfile }).consumption_tax; } catch { blockers.push("tax profile missing"); }
  if (!consumption?.taxpayer_basis) blockers.push("taxpayer basis missing");
  if (consumption?.method === "standard" && !consumption.purchase_allocation_method) blockers.push("purchase allocation method missing");
  if (consumption?.invoice_registered && !consumption.invoice_registration_effective_date) blockers.push("invoice registration effective date missing");
  let taxPeriodFrom = from;
  if (
    consumption?.invoice_registered === true &&
    typeof consumption.invoice_registration_effective_date === "string" &&
    (consumption.taxpayer_basis === "invoice_registration" || consumption.pre_registration_exempt === true)
  ) {
    if (consumption.invoice_registration_effective_date > to) {
      blockers.push("invoice registration effective date is after the filing period");
    } else if (consumption.invoice_registration_effective_date > from) {
      taxPeriodFrom = consumption.invoice_registration_effective_date;
    }
  }
  blockers.push(...assessSimplifiedTaxEligibility({
    ...consumption,
    periodFrom: taxPeriodFrom,
    periodTo: to,
    jurisdictionTestDate: from,
  }));
  blockers.push(...assessPurchaseAllocationContinuity({
    currentMethod: consumption?.purchase_allocation_method,
    periodFrom: from,
    history: Array.isArray(consumption?.purchase_allocation_history)
      ? consumption.purchase_allocation_history as Array<{ method: "individual" | "proportional"; effective_from: string; evidence_ref: string }>
      : undefined,
  }));
  let annualSummary: ConsumptionTaxSummary;
  try {
    annualSummary = buildConsumptionTaxSummary({ period: from.slice(0, 7), from: taxPeriodFrom, to, strict: true });
  } catch (error) {
    blockers.push(`consumption tax ledger invalid: ${error instanceof Error ? error.message : String(error)}`);
    annualSummary = buildConsumptionTaxSummary({
      period: from.slice(0, 7),
      from: taxPeriodFrom,
      to,
      manual: {},
    });
  }
  const summaries = [annualSummary];
  const output = annualSummary.output_tax_yen;
  const input = annualSummary.input_tax_yen;
  const classified = classifyConsumptionTaxFilingIssues(summaries);
  blockers.push(...classified.blockers);
  warnings.push(...classified.warnings);
  const priorNationalTax = typeof consumption?.prior_period_national_tax_yen === "number" ? consumption.prior_period_national_tax_yen : null;
  if (priorNationalTax == null) blockers.push("prior period national consumption tax missing");
  const configuredFrequency = (consumption?.interim_filing_frequency ?? "none") as InterimFrequency;
  const interim = buildInterimReconciliation({
    from,
    fiscalYear,
    priorNationalTax: priorNationalTax ?? 0,
    configured: configuredFrequency,
    voluntary: consumption?.voluntary_interim_filing === true,
  });
  if (priorNationalTax != null && interim.expected_frequency !== interim.configured_frequency) blockers.push(`interim filing frequency mismatch: expected ${interim.expected_frequency}, configured ${interim.configured_frequency}`);
  if (interim.paid_count !== interim.expected_count || interim.paid_yen !== interim.expected_yen) blockers.push(`interim payments mismatch: ${interim.paid_count}/${interim.expected_count} payments, ${interim.paid_yen}/${interim.expected_yen} yen`);
  const consumptionTaxRemittances = loadJournalEntries().entries.flatMap((entry) => {
    const source = entry.source;
    return source?.kind === "remittance" && source.obligation === "consumption_tax"
      ? [{ entry, source }]
      : [];
  });
  const unlinkedRemittances = consumptionTaxRemittances.filter(
    ({ source }) => !source.filing_kind || !source.tax_fiscal_year,
  );
  if (unlinkedRemittances.length > 0) {
    blockers.push(`consumption tax remittance missing return linkage: ${unlinkedRemittances.map(({ entry }) => entry.entry_id).join(", ")}`);
  }
  const remitted = consumptionTaxRemittances
    .filter(({ source }) => source.tax_fiscal_year === fiscalYear)
    .reduce((sum, { entry }) => sum + entry.lines.reduce((debits, line) => debits + line.debit_yen, 0), 0);
  const salesLines = summaries.flatMap((row) => row.lines).filter((line) => line.direction === "sales");
  const taxableSales10 = salesLines.filter((line) => line.tax_category === "taxable_10").reduce((sum, line) => sum + line.base_yen, 0);
  const taxableSales8 = salesLines.filter((line) => line.tax_category === "taxable_8").reduce((sum, line) => sum + line.base_yen, 0);
  const taxableSales = salesLines.filter((line) => ["taxable_10", "taxable_8", "tax_free"].includes(line.tax_category)).reduce((sum, line) => sum + line.base_yen, 0);
  const allSales = summaries.flatMap((row) => row.lines).filter((line) => line.direction === "sales").reduce((sum, line) => sum + line.base_yen, 0);
  const ratio = allSales > 0 ? (taxableSales / allSales) * 100 : 100;
  const twoTenthsRequested = consumption?.small_business_relief === "two_tenths";
  const twoTenthsEligible = isTwoTenthsReliefEligible({
    period_from: from,
    invoice_registered: consumption?.invoice_registered === true,
    pre_registration_exempt: consumption?.pre_registration_exempt === true,
    shortened_tax_period: consumption?.shortened_tax_period === true,
    base_period_sales_jpy: typeof consumption?.base_period_sales_jpy === "number" ? consumption.base_period_sales_jpy : null,
  });
  if (twoTenthsRequested && !twoTenthsEligible) blockers.push("two-tenths relief eligibility not satisfied");
  let automaticProfile: AnnualAdjustmentProfile = {};
  try { automaticProfile = loadAutomaticAnnualAdjustmentProfile(fiscalYear, endMonth); } catch (error) { blockers.push(`annual adjustment ledger invalid: ${error instanceof Error ? error.message : String(error)}`); }
  const automaticAssetIds = new Set((automaticProfile.fixed_asset_adjustments ?? []).map((asset) => asset.asset_id));
  const automaticInventoryRefs = new Set((automaticProfile.inventory_tax_adjustments ?? []).map((row) => row.inventory_record_ref));
  const mergedProfile: AnnualAdjustmentProfile = {
    ...consumption,
    fixed_asset_adjustments: [...(automaticProfile.fixed_asset_adjustments ?? []), ...(consumption?.fixed_asset_adjustments ?? []).filter((asset) => !automaticAssetIds.has(asset.asset_id))],
    inventory_tax_adjustments: [...(automaticProfile.inventory_tax_adjustments ?? []), ...(consumption?.inventory_tax_adjustments ?? []).filter((row) => !automaticInventoryRefs.has(row.inventory_record_ref))],
    high_value_assets: [...(automaticProfile.high_value_assets ?? []), ...(consumption?.high_value_assets ?? []).filter((asset) => !(automaticProfile.high_value_assets ?? []).some((auto) => auto.asset_id === asset.asset_id))],
  };
  const annualAdjustment = calculateAnnualInputTaxAdjustments(mergedProfile, fiscalYear);
  if ((automaticProfile.incomplete_assets ?? []).length > 0) {
    blockers.push(`fixed assets missing consumption-tax review: ${automaticProfile.incomplete_assets!.join(", ")}`);
  }
  if (annualAdjustment.restricted_assets.length > 0 && (consumption?.method === "simplified" || String(consumption?.status ?? "").includes("免税"))) {
    blockers.push(`high-value asset restriction conflicts with tax status/method: ${annualAdjustment.restricted_assets.map((asset) => asset.asset_id).join(", ")}`);
  }
  const outputAdjustment = summaries.reduce((sum, row) => sum + (row.output_tax_adjustment_yen ?? 0), 0);
  const effectiveInputBeforeFloor = twoTenthsRequested && twoTenthsEligible ? Math.floor(output * 0.8) : input + annualAdjustment.total_yen;
  const effectiveInput = Math.max(0, effectiveInputBeforeFloor);
  const advisorReviews = Array.isArray(consumption?.advisor_reviews)
    ? consumption.advisor_reviews as Array<{ fiscal_year: string; status: "pending" | "approved" | "rejected"; reviewer_ref?: string; reviewed_at?: string; evidence_ref?: string }>
    : [];
  const advisorReview = advisorReviews.find((review) => review.fiscal_year === fiscalYear) ?? { fiscal_year: fiscalYear, status: "pending" as const };
  if (advisorReview.status !== "approved") warnings.push(`tax advisor review ${advisorReview.status} for ${fiscalYear}`);
  const filed = calculateConsumptionTaxFilingAmounts({
    taxable_sales_10_yen: taxableSales10,
    taxable_sales_8_yen: taxableSales8,
    deductible_input_tax_yen: effectiveInput,
    output_tax_adjustment_yen: outputAdjustment,
    two_tenths_relief: twoTenthsRequested && twoTenthsEligible,
  });
  return consumptionTaxFilingDraftSchema.parse({
    fiscal_year: fiscalYear, submission: "not-for-etax" as const,
    status: blockers.length === 0 ? "ready_for_advisor_review" as const : "blocked" as const,
    policy_id: JP_CONSUMPTION_TAX_POLICY.id,
    calculation_method: twoTenthsRequested && twoTenthsEligible ? "two_tenths" as const : summaries[0]?.method ?? "standard",
    output_tax_yen: output, deductible_input_tax_yen: effectiveInput, net_tax_yen: filed.combined_tax_yen,
    ...filed,
    remitted_yen: remitted, remaining_yen: filed.combined_tax_yen - remitted,
    taxable_sales_ratio_pct: Math.round(ratio * 100) / 100,
    input_tax_adjustment_yen: annualAdjustment.total_yen,
    annual_adjustments: annualAdjustment.adjustments,
    schedules: [
      { id: "rate-summary", complete: true },
      { id: "purchase-credit", complete: blockers.length === 0 },
      { id: "taxable-sales-ratio", complete: Number.isFinite(ratio) },
      { id: "interim-payments", complete: interim.paid_count === interim.expected_count && interim.paid_yen === interim.expected_yen },
      { id: "annual-adjustments", complete: (automaticProfile.incomplete_assets ?? []).length === 0 },
      { id: "advisor-review", complete: advisorReview.status === "approved" },
    ],
    blockers: [...new Set(blockers)], warnings: [...new Set(warnings)],
    advisor_review: {
      status: advisorReview.status,
      reviewer_ref: advisorReview.reviewer_ref,
      reviewed_at: advisorReview.reviewed_at,
      evidence_ref: advisorReview.evidence_ref,
    },
    interim_reconciliation: interim,
  });
}
