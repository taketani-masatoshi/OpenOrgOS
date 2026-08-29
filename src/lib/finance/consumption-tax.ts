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

const TAX_RATE_10 = 0.1;
const TAX_RATE_8 = 0.08;

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

type TaxProfileConsumptionSlice = {
  /** Other jurisdiction slices are ignored here. */
  [key: string]: unknown;
  consumption_tax?: {
    status?: string;
    method?: ConsumptionTaxMethod;
    deemed_purchase_rate_pct?: number;
    base_period_sales_threshold?: number;
    base_period_sales_jpy?: number;
    invoice_registered?: boolean;
    invoice_registration_number?: string;
    invoice_exempt_reconciled_basis?: string;
  };
};

function emptyJournalTotals() {
  return {
    sales10: 0,
    sales8: 0,
    purchases10: 0,
    purchases8: 0,
    exemptSales: 0,
    taxFreeSales: 0,
  };
}

function aggregateFromJournal(period: string): ReturnType<typeof emptyJournalTotals> {
  const totals = emptyJournalTotals();
  try {
    const coa = loadChartOfAccounts();
    const accountByCode = new Map(coa.accounts.map((account) => [account.code, account]));
    for (const raw of loadJournalEntries().entries) {
      const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
      if (!entry.occurred_at.startsWith(period)) continue;
      for (const line of entry.lines) {
        if (!line.tax_category) continue;
        const account = accountByCode.get(line.account_code);
        if (!account) continue;
        if (account.type !== "revenue" && account.type !== "expense") continue;
        const amount = line.debit_yen || line.credit_yen;
        if (account.type === "revenue" && line.tax_category === "exempt") {
          totals.exemptSales += amount;
        }
        if (account.type === "revenue" && line.tax_category === "tax_free") {
          totals.taxFreeSales += amount;
        }
        if (line.tax_category === "taxable_10") {
          if (account.type === "expense") totals.purchases10 += amount;
          if (account.type === "revenue") totals.sales10 += amount;
        }
        if (line.tax_category === "taxable_8") {
          if (account.type === "expense") totals.purchases8 += amount;
          if (account.type === "revenue") totals.sales8 += amount;
        }
      }
    }
  } catch {
    /* journal / CoA optional for manual calc */
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
  manual?: Partial<ConsumptionTaxPeriod>;
  method?: ConsumptionTaxMethod;
  deemedPurchaseRatePct?: number;
}): ConsumptionTaxSummary {
  const journal = aggregateFromJournal(input.period);
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

  const output10 = taxFromBase(periodInput.taxable_sales_10_yen, TAX_RATE_10);
  const output8 = taxFromBase(periodInput.taxable_sales_8_yen, TAX_RATE_8);
  const outputTax = output10 + output8;
  const input10 = taxFromBase(periodInput.taxable_purchases_10_yen, TAX_RATE_10);
  const input8 = taxFromBase(periodInput.taxable_purchases_8_yen, TAX_RATE_8);
  let actualInput = input10 + input8;
  if (periodInput.transitional_deduction_rate_pct) {
    actualInput = Math.floor(
      (actualInput * periodInput.transitional_deduction_rate_pct) / 100,
    );
  }
  actualInput -= periodInput.non_deductible_purchase_tax_yen;
  actualInput = Math.max(0, actualInput);

  const method = input.method ?? "standard";
  let deductibleInput = actualInput;
  let deemedRate: DeemedPurchaseRatePct | undefined;
  if (method === "simplified") {
    deemedRate =
      input.manual?.deemed_purchase_rate_pct ??
      resolveDeemedPurchaseRatePct(undefined, input.deemedPurchaseRatePct);
    if (!deemedRate) {
      throw new Error(
        "simplified calc requires deemed_purchase_rate_pct (40/50/60/70/80/90)",
      );
    }
    deductibleInput = Math.floor((outputTax * deemedRate) / 100);
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
    baseSales != null ? baseSales >= threshold : null;
  const invoiceRegistered = Boolean(ct?.invoice_registered);
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
  } else if (taxableBySales === false && status.includes("課税")) {
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
