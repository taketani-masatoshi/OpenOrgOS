import type {
  ConsumptionTaxMethod,
  ConsumptionTaxPeriod,
  ConsumptionTaxSummary,
  DeemedPurchaseRatePct,
} from "../../../schemas/finance/consumption-tax.js";
import { deemedPurchaseRatePctSchema } from "../../../schemas/finance/consumption-tax.js";
import {
  journalEntrySchema,
  normalizeJournalEntry,
} from "../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts, loadTaxProfile } from "../data.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import type { TaxCategory } from "../../../schemas/finance/journal-entry.js";
import {
  JP_CONSUMPTION_TAX_POLICY,
  resolveTransitionalInvoiceCredit,
} from "./consumption-tax-policy.js";

const TAX_RATE_10 = JP_CONSUMPTION_TAX_POLICY.rates.taxable_10.total_rate_pct / 100;
const TAX_RATE_8 = JP_CONSUMPTION_TAX_POLICY.rates.taxable_8.total_rate_pct / 100;

function taxFromBase(base: number, rate: number): number {
  return Math.floor(base * rate);
}

/** 内税金額を本体と消費税に分解（切り捨て）。 */
export function splitInclusiveConsumptionTax(
  amountYen: number,
  ratePct: 10 | 8 = 10,
): { net_yen: number; tax_yen: number } {
  const tax_yen = Math.floor((amountYen * ratePct) / (100 + ratePct));
  return { net_yen: amountYen - tax_yen, tax_yen };
}

export function monthlyPlTaxCategory(
  kind: "revenue" | "expense",
  category: string,
): TaxCategory {
  if (kind === "revenue" && category === "rent") return "non_taxable";
  return "taxable_10";
}

export type TaxProfileConsumptionSlice = {
  /** Other jurisdiction slices are ignored here. */
  [key: string]: unknown;
  consumption_tax?: {
    status?: string;
    method?: ConsumptionTaxMethod;
    deemed_purchase_rate_pct?: number;
    simplified_multiple_business?: boolean;
    simplified_75_rule?: boolean;
    simplified_election_filed_on?: string;
    simplified_election_effective_from?: string;
    business_operator_kind?: "domestic" | "foreign";
    permanent_establishment_in_japan?: boolean;
    base_period_sales_threshold?: number;
    base_period_sales_jpy?: number;
    invoice_registered?: boolean;
    invoice_registration_number?: string;
    invoice_exempt_reconciled_basis?: string;
    specific_period_sales_jpy?: number;
    specific_period_payroll_jpy?: number;
    opening_capital_jpy?: number;
    taxable_entity_election?: boolean;
    invoice_registration_effective_date?: string;
    taxpayer_basis?: string;
    purchase_allocation_method?: "individual" | "proportional" | "full_credit_95_rule";
    taxable_sales_ratio_override_pct?: number;
    taxable_sales_ratio_override_evidence_ref?: string;
    taxable_sales_ratio_override_evidence_sha256?: string;
  };
};

function emptyJournalTotals() {
  return {
    sales10: 0,
    sales8: 0,
    outputTax10: 0,
    outputTax8: 0,
    purchases10: 0,
    purchases8: 0,
    exemptSales: 0,
    nonTaxableSales: 0,
    taxFreeSales: 0,
    inputTaxTaxableOnly: 0,
    inputTaxCommon: 0,
    inputTaxNonTaxable: 0,
    inputTaxGross: 0,
    outputTaxDeductions: 0,
    outputTaxAdditions: 0,
    reverseChargeTax: 0,
    reverseChargeTaxableOnly: 0,
    reverseChargeCommon: 0,
    reverseChargeNonTaxable: 0,
    importNationalTax: 0,
    importLocalTax: 0,
    simplifiedBusinessOutputTax: Object.fromEntries(
      ["type_1", "type_2", "type_3", "type_4", "type_5", "type_6", "unclassified"].map((key) => [key, 0]),
    ) as Record<string, number>,
    transactions: 0,
    issues: [] as Array<{ severity: "error" | "warning"; code: string; message: string }>,
  };
}

function roundedTax(base: number, ratePct: number, method: "floor" | "round" | "ceil" = "floor"): number {
  const raw = (base * ratePct) / 100;
  return method === "ceil" ? Math.ceil(raw) : method === "round" ? Math.round(raw) : Math.floor(raw);
}

function invoiceDeduction(input: {
  status: string | undefined;
  occurredOn: string;
}): { pct: number; issue?: { severity: "error" | "warning"; code: string; message: string } } {
  if (input.status === "qualified") return { pct: 100 };
  if (input.status === "exempt_supplier") return { pct: 0 };
  if (!input.status || input.status === "unknown") {
    return {
      pct: 0,
      issue: {
        severity: "warning",
        code: "invoice_status_missing",
        message: "invoice status missing or unknown; input tax credit set to zero pending evidence",
      },
    };
  }
  const transition = resolveTransitionalInvoiceCredit(
    input.status as "nonqualified_80" | "nonqualified_50",
    input.occurredOn,
  );
  if (!transition.valid) {
    return {
      pct: 0,
      issue: {
        severity: "error",
        code: "invoice_transitional_period_mismatch",
        message: `${input.status} is not valid on ${input.occurredOn}`,
      },
    };
  }
  return { pct: transition.credit_pct };
}

function aggregateFromJournal(input: {
  period: string;
  from?: string;
  to?: string;
  strict?: boolean;
}): ReturnType<typeof emptyJournalTotals> {
  const totals = emptyJournalTotals();
  try {
    const coa = loadChartOfAccounts();
    const accountByCode = new Map(coa.accounts.map((account) => [account.code, account]));
    for (const raw of loadJournalEntries().entries) {
      const rawOccurredAt = typeof raw.occurred_at === "string" ? raw.occurred_at : "";
      const occurredOn = rawOccurredAt.slice(0, 10);
      if (input.from && input.to) {
        if (occurredOn < input.from || occurredOn > input.to) continue;
      } else if (!rawOccurredAt.startsWith(input.period)) continue;
      const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
      for (const line of entry.lines) {
        if (!line.tax_category) continue;
        const account = accountByCode.get(line.account_code);
        if (!account) continue;
        if (
          line.tax_adjustment &&
          account.type === "revenue" &&
          (line.tax_category === "taxable_10" || line.tax_category === "taxable_8")
        ) {
          const rate = line.tax_category === "taxable_8" ? 8 : 10;
          const amount = line.debit_yen || line.credit_yen;
          const adjustmentTax = line.tax_amount_yen ?? (line.tax_basis === "inclusive" ? splitInclusiveConsumptionTax(amount, rate).tax_yen : roundedTax(amount, rate, line.tax_rounding));
          if (line.tax_adjustment === "bad_debt_recovery") {
            totals.outputTaxAdditions += adjustmentTax;
          } else {
            totals.outputTaxDeductions += adjustmentTax;
          }
          if (!line.original_entry_id) totals.issues.push({ severity: "error", code: "tax_adjustment_source_missing", message: `${entry.entry_id}/${line.account_code}: original_entry_id is required for ${line.tax_adjustment}` });
          if (line.tax_adjustment === "bad_debt" && entry.evidence_refs.length === 0) totals.issues.push({ severity: "error", code: "bad_debt_evidence_missing", message: `${entry.entry_id}: bad debt evidence is required` });
          continue;
        }
        const isSale = account.type === "revenue" && line.credit_yen > 0;
        const isPurchase = account.normal_balance === "debit" && line.debit_yen > 0;
        if (!isSale && !isPurchase) continue;
        const amount = line.debit_yen || line.credit_yen;
        if (isSale && line.tax_category === "exempt") {
          totals.exemptSales += amount;
        }
        if (isSale && line.tax_category === "non_taxable") totals.nonTaxableSales += amount;
        if (isSale && line.tax_category === "tax_free") {
          totals.taxFreeSales += amount;
        }
        const rate = line.tax_category === "taxable_8" ? 8 : 10;
        const taxableBase = line.tax_basis === "inclusive"
          ? splitInclusiveConsumptionTax(amount, rate).net_yen
          : amount;
        if (line.tax_category === "taxable_10") {
          if (isPurchase) totals.purchases10 += taxableBase;
          if (isSale) totals.sales10 += taxableBase;
        }
        if (line.tax_category === "taxable_8") {
          if (isPurchase) totals.purchases8 += taxableBase;
          if (isSale) totals.sales8 += taxableBase;
        }
        if (isSale && (line.tax_category === "taxable_10" || line.tax_category === "taxable_8")) {
          const saleTax = line.tax_amount_yen ?? (line.tax_basis === "inclusive" ? splitInclusiveConsumptionTax(amount, rate).tax_yen : roundedTax(amount, rate, line.tax_rounding));
          if (line.tax_category === "taxable_8") totals.outputTax8 += saleTax;
          else totals.outputTax10 += saleTax;
          totals.simplifiedBusinessOutputTax[line.simplified_business_type ?? "unclassified"] += saleTax;
        }
        if (isPurchase && (line.tax_category === "taxable_10" || line.tax_category === "taxable_8")) {
          totals.transactions += 1;
          const documentedTax = line.tax_amount_yen ?? (line.tax_basis === "inclusive" ? splitInclusiveConsumptionTax(amount, rate).tax_yen : roundedTax(amount, rate, line.tax_rounding));
          totals.inputTaxGross += documentedTax;
          if (line.tax_transaction === "import") {
            const importTax = (line.import_national_tax_yen ?? 0) + (line.import_local_tax_yen ?? 0);
            const complete = Boolean(
              line.import_date && line.customs_declaration_ref &&
              line.customs_payment_evidence_ref && line.customs_evidence_ref &&
              line.import_national_tax_yen != null && line.import_local_tax_yen != null,
            );
            const deductible = complete ? importTax : 0;
            totals.inputTaxGross += importTax - documentedTax;
            totals.importNationalTax += line.import_national_tax_yen ?? 0;
            totals.importLocalTax += line.import_local_tax_yen ?? 0;
            const use = line.purchase_use ?? "common";
            if (use === "taxable_only") totals.inputTaxTaxableOnly += deductible;
            else if (use === "non_taxable_only") totals.inputTaxNonTaxable += deductible;
            else totals.inputTaxCommon += deductible;
            if (!complete) totals.issues.push({ severity: "error", code: "import_customs_evidence_missing", message: `${entry.entry_id}/${line.account_code}: import input credit requires import date, declaration, permit/payment evidence, and separate national/local tax amounts` });
            if (line.import_date && entry.occurred_at.slice(0, 10) !== line.import_date) totals.issues.push({ severity: "warning", code: "import_date_differs_from_journal", message: `${entry.entry_id}/${line.account_code}: import date differs from journal date` });
            if (!line.purchase_use) totals.issues.push({ severity: "warning", code: "purchase_use_missing", message: `${entry.entry_id}/${line.account_code}: purchase use missing; treated as common` });
            continue;
          }
          if (line.tax_transaction === "reverse_charge") {
            if (line.tax_amount_yen == null) totals.issues.push({ severity: "error", code: "reverse_charge_tax_missing", message: `${entry.entry_id}/${line.account_code}: reverse charge requires tax_amount_yen` });
            const reverseTax = line.tax_amount_yen ?? 0;
            totals.reverseChargeTax += reverseTax;
            const use = line.purchase_use ?? "common";
            if (use === "taxable_only") totals.reverseChargeTaxableOnly += reverseTax;
            else if (use === "non_taxable_only") totals.reverseChargeNonTaxable += reverseTax;
            else totals.reverseChargeCommon += reverseTax;
            if (!line.purchase_use) totals.issues.push({ severity: "warning", code: "purchase_use_missing", message: `${entry.entry_id}/${line.account_code}: purchase use missing; treated as common` });
            continue;
          }
          const deduction = invoiceDeduction({
            status: line.invoice_status,
            occurredOn: entry.occurred_at.slice(0, 10),
          });
          const deductible = Math.floor((documentedTax * deduction.pct) / 100);
          const use = line.purchase_use ?? "common";
          if (use === "taxable_only") totals.inputTaxTaxableOnly += deductible;
          else if (use === "non_taxable_only") totals.inputTaxNonTaxable += deductible;
          else totals.inputTaxCommon += deductible;
          if (deduction.issue) totals.issues.push({
            ...deduction.issue,
            message: `${entry.entry_id}/${line.account_code}: ${deduction.issue.message}`,
          });
          if (!line.purchase_use) totals.issues.push({ severity: "warning", code: "purchase_use_missing", message: `${entry.entry_id}/${line.account_code}: purchase use missing; treated as common` });
        }
      }
    }
  } catch (error) {
    if (input.strict) throw error;
    /* Journal / CoA remain optional only for explicit/manual preview calculations. */
    return emptyJournalTotals();
  }
  return totals;
}

export function resolveConsumptionTaxMethod(
  profile?: TaxProfileConsumptionSlice,
  explicit?: ConsumptionTaxMethod,
): ConsumptionTaxMethod {
  if (explicit) return explicit;
  return profile?.consumption_tax?.method === "simplified" ? "simplified" : "standard";
}

export function resolveDeemedPurchaseRatePct(
  profile?: TaxProfileConsumptionSlice,
  explicit?: number,
): DeemedPurchaseRatePct | undefined {
  const raw = explicit ?? profile?.consumption_tax?.deemed_purchase_rate_pct;
  if (raw === undefined) return undefined;
  const parsed = deemedPurchaseRatePctSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function buildConsumptionTaxSummary(input: {
  period: string;
  /** Optional inclusive range. Used by statutory filing so allocation is applied once per tax period. */
  from?: string;
  to?: string;
  strict?: boolean;
  manual?: Partial<ConsumptionTaxPeriod>;
  method?: ConsumptionTaxMethod;
  deemedPurchaseRatePct?: number;
  /** Deterministic override for tests and offline calculation. Runtime defaults to tenant tax-profile. */
  profile?: TaxProfileConsumptionSlice;
}): ConsumptionTaxSummary {
  const journal = aggregateFromJournal(input);
  let profile = input.profile;
  if (!profile) {
    try { profile = loadTaxProfile() as TaxProfileConsumptionSlice; } catch { profile = undefined; }
  }
  const periodInput = {
    period: input.period,
    taxable_sales_10_yen:
      input.manual?.taxable_sales_10_yen ?? journal.sales10,
    taxable_sales_8_yen: input.manual?.taxable_sales_8_yen ?? journal.sales8,
    exempt_sales_yen: input.manual?.exempt_sales_yen ?? journal.exemptSales,
    tax_free_sales_yen: input.manual?.tax_free_sales_yen ?? journal.taxFreeSales,
    taxable_purchases_10_yen:
      input.manual?.taxable_purchases_10_yen ?? journal.purchases10,
    taxable_purchases_8_yen:
      input.manual?.taxable_purchases_8_yen ?? journal.purchases8,
    non_deductible_purchase_tax_yen:
      input.manual?.non_deductible_purchase_tax_yen ?? 0,
    transitional_deduction_rate_pct:
      input.manual?.transitional_deduction_rate_pct,
  };

  const output10 = input.manual?.taxable_sales_10_yen == null && journal.sales10 > 0
    ? journal.outputTax10
    : taxFromBase(periodInput.taxable_sales_10_yen, TAX_RATE_10);
  const output8 = input.manual?.taxable_sales_8_yen == null && journal.sales8 > 0
    ? journal.outputTax8
    : taxFromBase(periodInput.taxable_sales_8_yen, TAX_RATE_8);
  const method = resolveConsumptionTaxMethod(profile, input.method);
  const input10 = taxFromBase(periodInput.taxable_purchases_10_yen, TAX_RATE_10);
  const input8 = taxFromBase(periodInput.taxable_purchases_8_yen, TAX_RATE_8);
  const grossInput = journal.transactions > 0 ? journal.inputTaxGross : input10 + input8;
  const invoiceEligibleInput =
    journal.inputTaxTaxableOnly + journal.inputTaxCommon + journal.inputTaxNonTaxable;
  const salesNumerator = periodInput.taxable_sales_10_yen + periodInput.taxable_sales_8_yen + periodInput.tax_free_sales_yen;
  const salesDenominator = salesNumerator + periodInput.exempt_sales_yen + journal.nonTaxableSales;
  const actualRatioPct = salesDenominator > 0 ? (salesNumerator / salesDenominator) * 100 : 100;
  const allocation = profile?.consumption_tax?.purchase_allocation_method ?? "individual";
  const approvedRatio = profile?.consumption_tax?.taxable_sales_ratio_override_pct;
  const approvedRatioEvidence = profile?.consumption_tax?.taxable_sales_ratio_override_evidence_ref;
  const approvedRatioEvidenceSha256 = profile?.consumption_tax?.taxable_sales_ratio_override_evidence_sha256;
  const allocationRatioPct = allocation === "individual" && approvedRatio != null && approvedRatioEvidence && approvedRatioEvidenceSha256
    ? approvedRatio
    : actualRatioPct;
  if (approvedRatio != null && (!approvedRatioEvidence || !approvedRatioEvidenceSha256)) {
    journal.issues.push({ severity: "error", code: "taxable_sales_ratio_override_evidence_missing", message: "approved taxable-sales ratio requires evidence reference and SHA-256 digest" });
  }
  if (approvedRatio != null && allocation !== "individual") {
    journal.issues.push({ severity: "error", code: "taxable_sales_ratio_override_not_applicable", message: "approved taxable-sales ratio is available only for the individual allocation method" });
  }
  const reverseChargeApplies = method === "standard" && actualRatioPct < 95;
  const reverseChargeOutput = reverseChargeApplies ? journal.reverseChargeTax : 0;
  const outputTax = output10 + output8 + journal.outputTaxAdditions - journal.outputTaxDeductions + reverseChargeOutput;
  const fullCreditEligible = salesNumerator <= 500_000_000 && actualRatioPct >= 95;
  let actualInput = journal.transactions > 0
    ? journal.inputTaxTaxableOnly + Math.floor((journal.inputTaxCommon * allocationRatioPct) / 100)
    : grossInput;
  if (allocation === "full_credit_95_rule" && fullCreditEligible) {
    actualInput = journal.transactions > 0 ? invoiceEligibleInput : grossInput;
  }
  if (allocation === "full_credit_95_rule" && !fullCreditEligible) {
    journal.issues.push({
      severity: "error",
      code: "full_credit_95_rule_ineligible",
      message: `full-credit rule requires taxable sales of 500,000,000 yen or less and an actual taxable-sales ratio of at least 95% (sales=${salesNumerator}, ratio=${actualRatioPct})`,
    });
  }
  if (allocation === "proportional") {
    actualInput = Math.floor(
      ((journal.transactions > 0 ? invoiceEligibleInput : grossInput) * actualRatioPct) / 100,
    );
  }
  if (periodInput.transitional_deduction_rate_pct) {
    actualInput = Math.floor(
      (actualInput * periodInput.transitional_deduction_rate_pct) / 100,
    );
  }
  actualInput -= periodInput.non_deductible_purchase_tax_yen;
  if (reverseChargeApplies) {
    actualInput += journal.reverseChargeTaxableOnly + Math.floor((journal.reverseChargeCommon * allocationRatioPct) / 100);
  }
  actualInput = Math.max(0, actualInput);

  let deductibleInput = actualInput;
  let deemedRate: DeemedPurchaseRatePct | undefined;
  if (method === "simplified") {
    if (profile?.consumption_tax?.simplified_multiple_business) {
      const buckets = journal.simplifiedBusinessOutputTax;
      const classifiedTotal = Object.entries(buckets).filter(([key]) => key !== "unclassified").reduce((sum, [, value]) => sum + value, 0);
      if (buckets.unclassified > 0) journal.issues.push({ severity: "error", code: "simplified_business_type_missing", message: "multiple-business simplified tax requires simplified_business_type on every taxable sale" });
      const rates: Record<string, number> = { type_1: 90, type_2: 80, type_3: 70, type_4: 60, type_5: 50, type_6: 40 };
      const ranked = Object.entries(buckets).filter(([key, value]) => key !== "unclassified" && value > 0).sort((a, b) => b[1] - a[1]);
      let deemed = Object.entries(buckets).filter(([key]) => key !== "unclassified").reduce((sum, [key, value]) => sum + Math.floor((value * rates[key]) / 100), 0);
      if (profile.consumption_tax.simplified_75_rule && classifiedTotal > 0 && ranked[0]) {
        if ((ranked[0][1] / classifiedTotal) * 100 >= 75) {
          deemed = Math.floor((classifiedTotal * rates[ranked[0][0]]) / 100);
        } else if (ranked.length >= 3 && ((ranked[0][1] + ranked[1][1]) / classifiedTotal) * 100 >= 75) {
          const highRate = Math.max(rates[ranked[0][0]], rates[ranked[1][0]]);
          const lowRate = Math.min(rates[ranked[0][0]], rates[ranked[1][0]]);
          const highKey = rates[ranked[0][0]] === highRate ? ranked[0][0] : ranked[1][0];
          deemed = Math.floor((buckets[highKey] * highRate) / 100) + Math.floor(((classifiedTotal - buckets[highKey]) * lowRate) / 100);
        }
      }
      deductibleInput = deemed;
    } else {
    deemedRate =
      input.manual?.deemed_purchase_rate_pct ??
      resolveDeemedPurchaseRatePct(profile, input.deemedPurchaseRatePct);
    if (!deemedRate) {
      throw new Error(
        "simplified calc requires deemed_purchase_rate_pct (40/50/60/70/80/90)",
      );
    }
    deductibleInput = Math.floor((outputTax * deemedRate) / 100);
    }
  }

  const net = outputTax - deductibleInput;
  const direction = net < 0 ? "refund_candidate" : "payable";

  return {
    period: input.period,
    output_tax_yen: outputTax,
    input_tax_yen: deductibleInput,
    net_tax_yen: net,
    refund_candidate_yen: net < 0 ? -net : 0,
    direction,
    method,
    exempt_sales_yen: periodInput.exempt_sales_yen,
    tax_free_sales_yen: periodInput.tax_free_sales_yen,
    deemed_purchase_rate_pct: deemedRate,
    taxable_sales_ratio_pct: Math.round(actualRatioPct * 100) / 100,
    input_tax_allocation_ratio_pct: Math.round(allocationRatioPct * 100) / 100,
    gross_input_tax_yen: grossInput,
    non_deductible_input_tax_yen: Math.max(0, grossInput - deductibleInput),
    transaction_count: journal.transactions,
    output_tax_adjustment_yen: journal.outputTaxDeductions - journal.outputTaxAdditions,
    reverse_charge_tax_yen: reverseChargeOutput,
    import_national_tax_yen: journal.importNationalTax,
    import_local_tax_yen: journal.importLocalTax,
    simplified_business_breakdown: method === "simplified" && profile?.consumption_tax?.simplified_multiple_business ? journal.simplifiedBusinessOutputTax : undefined,
    issues: journal.issues,
    lines: [
      {
        tax_category: "taxable_10",
        base_yen: periodInput.taxable_sales_10_yen,
        tax_yen: output10,
        direction: "sales",
      },
      {
        tax_category: "taxable_8",
        base_yen: periodInput.taxable_sales_8_yen,
        tax_yen: output8,
        direction: "sales",
      },
      {
        tax_category: "tax_free",
        base_yen: periodInput.tax_free_sales_yen,
        tax_yen: 0,
        direction: "sales",
      },
      { tax_category: "exempt", base_yen: periodInput.exempt_sales_yen, tax_yen: 0, direction: "sales" },
      { tax_category: "non_taxable", base_yen: journal.nonTaxableSales, tax_yen: 0, direction: "sales" },
      {
        tax_category: "taxable_10",
        base_yen: periodInput.taxable_purchases_10_yen,
        tax_yen: input10,
        direction: "purchase",
      },
      {
        tax_category: "taxable_8",
        base_yen: periodInput.taxable_purchases_8_yen,
        tax_yen: input8,
        direction: "purchase",
      },
    ],
  };
}

export function formatConsumptionTaxMarkdown(summary: ConsumptionTaxSummary): string {
  const netLabel =
    summary.direction === "refund_candidate" ? "還付候補（差引）" : "差引納付税額";
  return [
    `# 消費税集計 ${summary.period}`,
    "",
    `- 方式: ${summary.method}${
      summary.deemed_purchase_rate_pct
        ? ` · みなし仕入率 ${summary.deemed_purchase_rate_pct}%`
        : ""
    }`,
    `- 売上税額: ${summary.output_tax_yen.toLocaleString()} JPY`,
    `- ${summary.method === "simplified" ? "みなし仕入税額" : "仕入税額（控除）"}: ${summary.input_tax_yen.toLocaleString()} JPY`,
    `- ${netLabel}: ${summary.net_tax_yen.toLocaleString()} JPY`,
    `- 方向: ${summary.direction}`,
    `- 輸出免税売上: ${summary.tax_free_sales_yen.toLocaleString()} JPY`,
    `- 非課税売上: ${summary.exempt_sales_yen.toLocaleString()} JPY`,
    "",
    summary.direction === "refund_candidate"
      ? "還付申請パックは `jp_consumption_refund`（提出は人間）。申告書は生成しません。"
      : "申告書は生成しません（税理士受け渡し用集計）。",
  ].join("\n");
}

/** 基準期間課税売上の免税事業者判定閾値（円）。 */
export const JP_CONSUMPTION_TAX_EXEMPT_THRESHOLD_JPY = 10_000_000;

export type ConsumptionTaxCheckIssue = {
  severity: "blocking" | "warning" | "info";
  code: string;
  message: string;
};

export type ConsumptionTaxCheckResult = {
  status: string;
  taxable_by_sales: boolean | null;
  threshold_jpy: number;
  base_period_sales_jpy: number | null;
  invoice_registered: boolean;
  taxpayer_basis?: string;
  issues: ConsumptionTaxCheckIssue[];
};

export function assessConsumptionTaxProfile(
  profile: TaxProfileConsumptionSlice,
): ConsumptionTaxCheckResult {
  const ct = profile.consumption_tax;
  const status = String(ct?.status ?? "TBD");
  const threshold =
    ct?.base_period_sales_threshold ?? JP_CONSUMPTION_TAX_EXEMPT_THRESHOLD_JPY;
  const baseSales = ct?.base_period_sales_jpy ?? null;
  const taxableBySales =
    baseSales != null ? baseSales > threshold : null;
  const invoiceRegistered = Boolean(ct?.invoice_registered);
  const specificPeriodTaxable = ct?.specific_period_sales_jpy != null && ct?.specific_period_payroll_jpy != null && ct.specific_period_sales_jpy > threshold && ct.specific_period_payroll_jpy > threshold;
  const capitalTaxable = (ct?.opening_capital_jpy ?? 0) >= threshold;
  const legallyTaxable = taxableBySales === true || specificPeriodTaxable || capitalTaxable || ct?.taxable_entity_election === true || (invoiceRegistered && Boolean(ct?.invoice_registration_effective_date));
  const issues: ConsumptionTaxCheckIssue[] = [];

  if (status === "TBD") {
    issues.push({
      severity: "blocking",
      code: "status_tbd",
      message: "消費税区分が未確定（TBD）",
    });
  }

  if (baseSales == null) {
    issues.push({
      severity: "warning",
      code: "base_period_missing",
      message: "基準期間課税売上（base_period_sales_jpy）が未設定",
    });
  } else if (taxableBySales === false && status.includes("課税") && !legallyTaxable) {
    issues.push({
      severity: "warning",
      code: "sales_vs_status",
      message: `基準期間売上 ${baseSales.toLocaleString("ja-JP")} 円は閾値未満だが status が課税を示す`,
    });
  } else if (taxableBySales === true && status.includes("免税")) {
    issues.push({
      severity: "warning",
      code: "sales_vs_status",
      message: `基準期間売上 ${baseSales.toLocaleString("ja-JP")} 円は閾値以上だが status が免税を示す`,
    });
  }

  if (!ct?.taxpayer_basis) issues.push({ severity: "blocking", code: "taxpayer_basis_missing", message: "課税・免税判定根拠が未設定（申告準備ではblocking）" });
  if (invoiceRegistered && !ct?.invoice_registration_effective_date) issues.push({ severity: "blocking", code: "invoice_effective_date_missing", message: "インボイス登録の効力発生日が未設定（申告準備ではblocking）" });
  if (ct?.method === "standard" && !ct.purchase_allocation_method) issues.push({ severity: "blocking", code: "purchase_allocation_missing", message: "本則課税の仕入税額控除方式が未設定（申告準備ではblocking）" });

  if (
    invoiceRegistered &&
    status.includes("免税") &&
    !ct?.invoice_exempt_reconciled_basis
  ) {
    issues.push({
      severity: "warning",
      code: "invoice_exempt_reconcile",
      message:
        "インボイス登録済みかつ免税 — invoice_exempt_reconciled_basis 未記録",
    });
  }

  if (invoiceRegistered && !ct?.invoice_registration_number) {
    issues.push({
      severity: "warning",
      code: "invoice_number_missing",
      message: "invoice_registered=true だが登録番号が未設定",
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      code: "ok",
      message: "機械検証上の矛盾なし（税理士最終確認は別途）",
    });
  }

  return {
    status,
    taxable_by_sales: taxableBySales,
    threshold_jpy: threshold,
    base_period_sales_jpy: baseSales,
    invoice_registered: invoiceRegistered,
    taxpayer_basis: ct?.taxpayer_basis,
    issues,
  };
}

export function runConsumptionTaxCheck(): ConsumptionTaxCheckResult {
  const result = assessConsumptionTaxProfile(
    loadTaxProfile() as TaxProfileConsumptionSlice,
  );
  try {
    for (const raw of loadJournalEntries().entries) {
      const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
      for (const line of entry.lines) {
        if (!line.tax_category) {
          result.issues.push({
            severity: "blocking",
            code: "journal_tax_category",
            message: `${entry.entry_id}: account ${line.account_code} missing tax_category`,
          });
        }
      }
    }
  } catch {
    /* journal optional */
  }
  return result;
}

export function formatConsumptionTaxCheckMarkdown(
  result: ConsumptionTaxCheckResult,
): string {
  const lines = [
    "# 消費税区分チェック",
    "",
    `- status: **${result.status}**`,
    `- 基準期間売上: ${
      result.base_period_sales_jpy != null
        ? `${result.base_period_sales_jpy.toLocaleString("ja-JP")} 円`
        : "未設定"
    }`,
    `- 閾値: ${result.threshold_jpy.toLocaleString("ja-JP")} 円`,
    `- 売上ベース課税判定: ${
      result.taxable_by_sales == null ? "—" : result.taxable_by_sales ? "課税" : "免税"
    }`,
    `- インボイス登録: ${result.invoice_registered ? "あり" : "なし"}`,
    "",
    "## 所見",
    ...result.issues.map(
      (i) => `- [${i.severity}] ${i.code}: ${i.message}`,
    ),
  ];
  return lines.join("\n");
}
