import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import { loadChartOfAccounts, loadMonthlyFinances, loadPayroll } from "../data.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import {
  monthlyPlTaxCategory,
  splitInclusiveConsumptionTax,
} from "./consumption-tax.js";
import type { TaxCategory } from "../../../schemas/finance/journal-entry.js";
import {
  shouldSkipInvoiceJournal,
} from "./ledger/invoice-mpl-dedupe.js";

const SKIP_EXPENSE_CATEGORIES = new Set(["depreciation", "loan_payment", "capex"]);
const CASH_PL_TYPES = new Set(["revenue", "expense"]);

function categoryEntrySlug(category: string): string {
  return category.replace(/_/g, "-").toUpperCase();
}

function isPlAccountType(
  coa: ReturnType<typeof loadChartOfAccounts>,
  accountCode: string,
): boolean {
  const account = coa.accounts.find((a) => a.code === accountCode);
  return account ? CASH_PL_TYPES.has(account.type) : false;
}

type JournalLine = {
  account_code: string;
  debit_yen: number;
  credit_yen: number;
  tax_category: TaxCategory;
  tax_rate_pct?: number;
  counterparty_id?: string;
};

type MonthlyBucket = {
  category: string;
  propertyId?: string;
  amount: number;
};

function groupMonthlyLines(
  lines: Array<{ category: string; property_id?: string; amount: number }>,
): MonthlyBucket[] {
  const map = new Map<string, MonthlyBucket>();
  for (const line of lines) {
    const key = `${line.category}::${line.property_id ?? ""}`;
    const cur = map.get(key) ?? {
      category: line.category,
      propertyId: line.property_id,
      amount: 0,
    };
    cur.amount += line.amount;
    map.set(key, cur);
  }
  return [...map.values()];
}

function monthlyPlEntryId(
  period: string,
  kind: "REV" | "EXP",
  bucket: MonthlyBucket,
  sameCategoryCount: number,
): string {
  const slug = categoryEntrySlug(bucket.category);
  if (sameCategoryCount <= 1 || !bucket.propertyId) {
    return `JE-MPL-${period}-${kind}-${slug}`;
  }
  return `JE-MPL-${period}-${kind}-${slug}-${bucket.propertyId}`;
}

function buildMonthlyRevenueLines(input: {
  contra: string;
  revenueAccount: string;
  amount: number;
  taxCategory: TaxCategory;
  taxPayable?: string;
  counterpartyId?: string;
}): JournalLine[] {
  const split =
    input.taxCategory === "taxable_10" &&
    input.taxPayable &&
    splitInclusiveConsumptionTax(input.amount, 10);
  if (split && split.tax_yen > 0) {
    return [
      {
        account_code: input.contra,
        debit_yen: input.amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
        counterparty_id: input.counterpartyId,
      },
      {
        account_code: input.revenueAccount,
        debit_yen: 0,
        credit_yen: split.net_yen,
        tax_category: "taxable_10",
        tax_rate_pct: 10,
      },
      {
        account_code: input.taxPayable!,
        debit_yen: 0,
        credit_yen: split.tax_yen,
        tax_category: "out_of_scope",
      },
    ];
  }
  return [
    {
      account_code: input.contra,
      debit_yen: input.amount,
      credit_yen: 0,
      tax_category: "out_of_scope",
      counterparty_id: input.counterpartyId,
    },
    {
      account_code: input.revenueAccount,
      debit_yen: 0,
      credit_yen: input.amount,
      tax_category: input.taxCategory,
    },
  ];
}

function buildMonthlyExpenseLines(input: {
  contra: string;
  expenseAccount: string;
  amount: number;
  taxCategory: TaxCategory;
  taxReceivable?: string;
  counterpartyId?: string;
}): JournalLine[] {
  const split =
    input.taxCategory === "taxable_10" &&
    input.taxReceivable &&
    splitInclusiveConsumptionTax(input.amount, 10);
  if (split && split.tax_yen > 0) {
    return [
      {
        account_code: input.expenseAccount,
        debit_yen: split.net_yen,
        credit_yen: 0,
        tax_category: "taxable_10",
        tax_rate_pct: 10,
      },
      {
        account_code: input.taxReceivable!,
        debit_yen: split.tax_yen,
        credit_yen: 0,
        tax_category: "out_of_scope",
      },
      {
        account_code: input.contra,
        debit_yen: 0,
        credit_yen: input.amount,
        tax_category: "out_of_scope",
        counterparty_id: input.counterpartyId,
      },
    ];
  }
  return [
    {
      account_code: input.expenseAccount,
      debit_yen: input.amount,
      credit_yen: 0,
      tax_category: input.taxCategory,
    },
    {
      account_code: input.contra,
      debit_yen: 0,
      credit_yen: input.amount,
      tax_category: "out_of_scope",
      counterparty_id: input.counterpartyId,
    },
  ];
}

/** Post accrual P/L from monthly YAML (revenue→AR 1150, expense→AP 2110). Skips depreciation (JE-DEP). */
export function postMonthlyPlJournalEntries(input: {
  period: string;
  authorizedBy: string;
}): string[] {
  const coa = loadChartOfAccounts();
  const accounts = resolveJournalSourceAccounts();
  const ar = accounts.accounts_receivable;
  const ap = accounts.accounts_payable ?? "2110";
  const finances = loadMonthlyFinances();
  const monthRow = finances.find((row) => row.month === input.period);
  if (!monthRow) return [];

  const revenueBuckets = groupMonthlyLines(monthRow.revenue);
  const expenseBuckets = groupMonthlyLines(monthRow.expenses);
  const posted: string[] = [];

  for (const bucket of revenueBuckets) {
    if (bucket.amount <= 0) continue;
    const accountCode = coa.category_mapping.revenue[bucket.category as never];
    if (!accountCode || !isPlAccountType(coa, accountCode)) continue;
    const sameCategory = revenueBuckets.filter((row) => row.category === bucket.category).length;
    const entryId = monthlyPlEntryId(input.period, "REV", bucket, sameCategory);
    const taxCategory = monthlyPlTaxCategory("revenue", bucket.category);
    appendJournalEntry({
      entry_id: entryId,
      occurred_at: `${input.period}-28T12:00:00.000Z`,
      description: `Monthly P/L revenue ${bucket.category} ${input.period}`,
      source: {
        kind: "closing",
        period: input.period,
        adjustment_id: `monthly-pl-rev-${bucket.category}`,
      },
      evidence_refs: [`monthly:${input.period}`, `category:${bucket.category}`],
      lines: buildMonthlyRevenueLines({
        contra: ar,
        revenueAccount: accountCode,
        amount: bucket.amount,
        taxCategory,
        taxPayable: accounts.consumption_tax_payable,
        counterpartyId: bucket.propertyId,
      }),
    });
    posted.push(entryId);
  }

  for (const bucket of expenseBuckets) {
    if (bucket.amount <= 0) continue;
    if (SKIP_EXPENSE_CATEGORIES.has(bucket.category)) continue;
    const accountCode = coa.category_mapping.expense[bucket.category as never];
    if (!accountCode || !isPlAccountType(coa, accountCode)) continue;
    const sameCategory = expenseBuckets.filter((row) => row.category === bucket.category).length;
    const entryId = monthlyPlEntryId(input.period, "EXP", bucket, sameCategory);
    const taxCategory = monthlyPlTaxCategory("expense", bucket.category);
    appendJournalEntry({
      entry_id: entryId,
      occurred_at: `${input.period}-28T12:00:00.000Z`,
      description: `Monthly P/L expense ${bucket.category} ${input.period}`,
      source: {
        kind: "closing",
        period: input.period,
        adjustment_id: `monthly-pl-exp-${bucket.category}`,
      },
      evidence_refs: [`monthly:${input.period}`, `category:${bucket.category}`],
      lines: buildMonthlyExpenseLines({
        contra: ap,
        expenseAccount: accountCode,
        amount: bucket.amount,
        taxCategory,
        taxReceivable: accounts.consumption_tax_receivable,
        counterpartyId: bucket.propertyId,
      }),
    });
    posted.push(entryId);
  }

  return posted;
}

export function postPayrollJournalEntry(input: {
  period: string;
  authorizedBy: string;
  grossYen?: number;
  withholdingYen?: number;
  socialEmployerYen?: number;
}): string | null {
  const accounts = resolveJournalSourceAccounts();
  const payroll = loadPayroll();
  const gross =
    input.grossYen ?? payroll.employee_payroll?.monthly_gross_jpy ?? 0;
  if (gross <= 0) return null;

  const withholding = input.withholdingYen ?? Math.round(gross * 0.1);
  const social = input.socialEmployerYen ?? Math.round(gross * 0.15);
  const net = gross - withholding;
  const entryId = `JE-PAYROLL-${input.period}`;

  appendJournalEntry({
    entry_id: entryId,
    occurred_at: `${input.period}-25T00:00:00.000Z`,
    description: `Payroll ${input.period}`,
    source: { kind: "payroll", period: input.period },
    evidence_refs: [`payroll:${input.period}`],
    lines: [
      {
        account_code: accounts.payroll_expense,
        debit_yen: gross + social,
        credit_yen: 0,
        tax_category: "out_of_scope",
      },
      {
        account_code: accounts.withholding_payable,
        debit_yen: 0,
        credit_yen: withholding,
        tax_category: "out_of_scope",
      },
      {
        account_code: accounts.social_insurance_payable,
        debit_yen: 0,
        credit_yen: social,
        tax_category: "out_of_scope",
      },
      {
        account_code: accounts.payroll_payable,
        debit_yen: 0,
        credit_yen: net,
        tax_category: "out_of_scope",
      },
    ],
  });
  return entryId;
}

export function postArReceiptJournalEntry(input: {
  ledgerEntryId: string;
  amountYen: number;
  /** Counterparty / property id on the AR credit line (not the event id). */
  counterpartyId: string;
  bankAccountCode?: string;
  arAccountCode?: string;
  occurredAt: string;
  authorizedBy: string;
}): string {
  const accounts = resolveJournalSourceAccounts();
  const entryId = `JE-AR-${input.ledgerEntryId}`;
  appendJournalEntry({
    entry_id: entryId,
    occurred_at: input.occurredAt,
    description: `AR receipt ${input.ledgerEntryId}`,
    source: {
      kind: "ar_ap",
      ledger_entry_id: input.ledgerEntryId,
    },
    evidence_refs: [`ar-ap:${input.ledgerEntryId}`],
    lines: [
      {
        account_code: input.bankAccountCode ?? accounts.bank_control,
        debit_yen: input.amountYen,
        credit_yen: 0,
        tax_category: "out_of_scope",
      },
      {
        account_code: input.arAccountCode ?? accounts.accounts_receivable,
        debit_yen: 0,
        credit_yen: input.amountYen,
        counterparty_id: input.counterpartyId,
        tax_category: "out_of_scope",
      },
    ],
  });
  return entryId;
}

/** Settle AP: Dr accounts payable / Cr cash. */
export function postApPaymentJournalEntry(input: {
  ledgerEntryId: string;
  amountYen: number;
  counterpartyId: string;
  bankAccountCode?: string;
  apAccountCode?: string;
  occurredAt: string;
  authorizedBy: string;
}): string {
  const accounts = resolveJournalSourceAccounts();
  const ap = input.apAccountCode ?? accounts.accounts_payable ?? "2110";
  const entryId = `JE-AP-${input.ledgerEntryId}`;
  appendJournalEntry({
    entry_id: entryId,
    occurred_at: input.occurredAt,
    description: `AP payment ${input.ledgerEntryId}`,
    source: {
      kind: "ar_ap",
      ledger_entry_id: input.ledgerEntryId,
    },
    evidence_refs: [`ar-ap:${input.ledgerEntryId}`],
    lines: [
      {
        account_code: ap,
        debit_yen: input.amountYen,
        credit_yen: 0,
        counterparty_id: input.counterpartyId,
        tax_category: "out_of_scope",
      },
      {
        account_code: input.bankAccountCode ?? accounts.bank_control,
        debit_yen: 0,
        credit_yen: input.amountYen,
        tax_category: "out_of_scope",
      },
    ],
  });
  return entryId;
}

export function postSalesInvoiceJournalEntry(input: {
  invoiceId: string;
  amountYen: number;
  revenueAccountCode?: string;
  arAccountCode?: string;
  taxCategory?: "taxable_10" | "taxable_8" | "exempt" | "non_taxable" | "out_of_scope" | "tax_free";
  netRevenueYen?: number;
  consumptionTaxYen?: number;
  lodgingTaxYen?: number;
  occurredAt: string;
  authorizedBy: string;
  propertyId?: string;
}): string | null {
  const period = input.occurredAt.slice(0, 7);
  const skip = shouldSkipInvoiceJournal({
    invoiceId: input.invoiceId,
    propertyId: input.propertyId,
    occurredAt: input.occurredAt,
  });
  if (skip.skip) {
    console.warn(`⚠ skip invoice journal ${input.invoiceId}: ${skip.reason}`);
    return null;
  }

  const accounts = resolveJournalSourceAccounts();
  const entryId = `JE-INV-${input.invoiceId}`;
  const taxCategory = input.taxCategory ?? "taxable_10";
  const lines: {
    account_code: string;
    debit_yen: number;
    credit_yen: number;
    tax_category: typeof taxCategory | "out_of_scope";
  }[] = [
    {
      account_code: input.arAccountCode ?? accounts.accounts_receivable,
      debit_yen: input.amountYen,
      credit_yen: 0,
      tax_category: "out_of_scope",
    },
  ];

  const splitTax =
    taxCategory === "taxable_10" &&
    input.netRevenueYen != null &&
    input.consumptionTaxYen != null &&
    accounts.consumption_tax_payable;

  if (splitTax) {
    lines.push({
      account_code: input.revenueAccountCode ?? "4100",
      debit_yen: 0,
      credit_yen: input.netRevenueYen!,
      tax_category: taxCategory,
    });
    lines.push({
      account_code: accounts.consumption_tax_payable!,
      debit_yen: 0,
      credit_yen: input.consumptionTaxYen!,
      tax_category: "out_of_scope",
    });
    const lodgingTaxYen = input.lodgingTaxYen ?? 0;
    if (lodgingTaxYen > 0 && accounts.lodging_tax_payable) {
      lines.push({
        account_code: accounts.lodging_tax_payable,
        debit_yen: 0,
        credit_yen: lodgingTaxYen,
        tax_category: "out_of_scope",
      });
    }
    const credited = input.netRevenueYen! + input.consumptionTaxYen! + lodgingTaxYen;
    if (credited !== input.amountYen) {
      throw new Error(
        `Invoice journal split mismatch: AR ${input.amountYen} != credits ${credited} (${input.invoiceId})`,
      );
    }
  } else {
    lines.push({
      account_code: input.revenueAccountCode ?? "4100",
      debit_yen: 0,
      credit_yen: input.amountYen,
      tax_category: taxCategory,
    });
  }

  appendJournalEntry({
    entry_id: entryId,
    occurred_at: input.occurredAt,
    description: `Invoice issued ${input.invoiceId}`,
    source: {
      kind: "ar_ap",
      ledger_entry_id: input.invoiceId,
    },
    evidence_refs: [`invoice:${input.invoiceId}`],
    lines,
  });
  return entryId;
}

export type RemittanceObligation =
  | "withholding"
  | "social_insurance"
  | "consumption_tax";

/** Settle a statutory payable from the trial balance (Dr payable / Cr cash). */
export function postRemittanceJournalEntry(input: {
  period: string;
  obligation: RemittanceObligation;
  authorizedBy: string;
}): string | null {
  const accounts = resolveJournalSourceAccounts();
  const asOf = `${input.period}-31`;
  const trial = buildTrialBalance({ asOf });
  const cash = accounts.bank_control;
  const entryId = `JE-REMIT-${input.obligation.replace(/_/g, "-").toUpperCase()}-${input.period}`;

  const balanceOf = (code: string | undefined): number =>
    code
      ? (trial.rows.find((row) => row.account_code === code)?.balance_yen ?? 0)
      : 0;

  const lines: JournalLine[] = [];
  if (input.obligation === "withholding") {
    const amount = balanceOf(accounts.withholding_payable);
    if (amount <= 0) return null;
    lines.push(
      {
        account_code: accounts.withholding_payable,
        debit_yen: amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
      },
      {
        account_code: cash,
        debit_yen: 0,
        credit_yen: amount,
        tax_category: "out_of_scope",
      },
    );
  } else if (input.obligation === "social_insurance") {
    const amount = balanceOf(accounts.social_insurance_payable);
    if (amount <= 0) return null;
    lines.push(
      {
        account_code: accounts.social_insurance_payable,
        debit_yen: amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
      },
      {
        account_code: cash,
        debit_yen: 0,
        credit_yen: amount,
        tax_category: "out_of_scope",
      },
    );
  } else {
    const payable = balanceOf(accounts.consumption_tax_payable);
    const receivable = balanceOf(accounts.consumption_tax_receivable);
    if (payable <= 0 && receivable <= 0) return null;
    const net = payable - receivable;
    if (payable > 0 && accounts.consumption_tax_payable) {
      lines.push({
        account_code: accounts.consumption_tax_payable,
        debit_yen: payable,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    if (receivable > 0 && accounts.consumption_tax_receivable) {
      lines.push({
        account_code: accounts.consumption_tax_receivable,
        debit_yen: 0,
        credit_yen: receivable,
        tax_category: "out_of_scope",
      });
    }
    if (net > 0) {
      lines.push({
        account_code: cash,
        debit_yen: 0,
        credit_yen: net,
        tax_category: "out_of_scope",
      });
    } else if (net < 0) {
      lines.push({
        account_code: cash,
        debit_yen: -net,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
  }

  appendJournalEntry({
    entry_id: entryId,
    occurred_at: `${input.period}-28T15:00:00.000Z`,
    description: `Remittance ${input.obligation} ${input.period}`,
    source: {
      kind: "remittance",
      period: input.period,
      obligation: input.obligation,
    },
    evidence_refs: [`remittance:${input.obligation}:${input.period}`],
    lines,
  });
  return entryId;
}

/** Pay net payroll payable: Dr 2140 / Cr cash. */
export function postPayrollPaymentJournalEntry(input: {
  period: string;
  authorizedBy: string;
  amountYen?: number;
}): string | null {
  const accounts = resolveJournalSourceAccounts();
  const asOf = `${input.period}-31`;
  const trial = buildTrialBalance({ asOf });
  const payable =
    trial.rows.find((row) => row.account_code === accounts.payroll_payable)
      ?.balance_yen ?? 0;
  const amount = input.amountYen ?? payable;
  if (amount <= 0) return null;
  const entryId = `JE-PAYROLL-PAY-${input.period}`;
  appendJournalEntry({
    entry_id: entryId,
    occurred_at: `${input.period}-28T16:00:00.000Z`,
    description: `Payroll payment ${input.period}`,
    source: { kind: "payroll", period: input.period },
    evidence_refs: [`payroll-payment:${input.period}`],
    lines: [
      {
        account_code: accounts.payroll_payable,
        debit_yen: amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
      },
      {
        account_code: accounts.bank_control,
        debit_yen: 0,
        credit_yen: amount,
        tax_category: "out_of_scope",
      },
    ],
  });
  return entryId;
}
