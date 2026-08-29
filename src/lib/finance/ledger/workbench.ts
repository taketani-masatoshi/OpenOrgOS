import { loadJournalEntries } from "../expense-claim-journal.js";
import { latestLockForMonth, loadPeriodLocks } from "../period-lock.js";
import { resolveJournalSourceAccounts } from "../journal-source-accounts.js";
import { buildTaxCalendarPortfolio } from "../tax-calendar-portfolio.js";
import { remittanceObligationFromCashflowCategory } from "../remittance-from-calendar.js";
import { listBankReconciliationWorkbench } from "../bank-reconcile-apply.js";
import {
  buildComparativeBalanceSheet,
  buildComparativeProfitLoss,
} from "./comparative-statements.js";
import { buildCashFlowStatement } from "./cash-flow-statement.js";
import { buildBalanceSheet } from "./balance-sheet.js";
import { buildMonthlyReconcileReport } from "./monthly-reconcile.js";
import { buildSubsidiaryLedger } from "./subsidiary-ledger.js";
import { buildTrialBalance } from "./trial-balance.js";
import { unpostedMonthlyPlIssues } from "./unposted-months.js";
import {
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "../fiscal-year.js";
import { buildGlProfitLossSummary } from "../gl-report-basis.js";

function ledgerExportPath(
  template: string,
  asOf: string,
): string {
  const params = new URLSearchParams({ template, as_of: asOf });
  return `/chat/v1/ledger/export?${params.toString()}`;
}

export type LedgerWorkbenchSnapshot = {
  as_of: string;
  trial_balance: {
    balanced: boolean;
    debit_total_yen: number;
    credit_total_yen: number;
    rows: Array<{
      account_code: string;
      account_name: string;
      balance_yen: number;
    }>;
  };
  balance_sheet: {
    balanced: boolean;
    total_assets_yen: number;
    total_liabilities_yen: number;
    total_equity_yen: number;
    net_income_yen: number;
  };
  cash_flow: {
    method: string;
    net_cash_change_yen: number;
    cash_begin_yen: number;
    cash_end_yen: number;
    reconciled: boolean;
    operating_total_yen: number;
    investing_total_yen: number;
    financing_total_yen: number;
  };
  prior_compare: {
    prior_as_of: string;
    assets: { current: number; prior: number; delta: number };
    liabilities: { current: number; prior: number; delta: number };
    equity: { current: number; prior: number; delta: number };
    net_income: { current: number; prior: number; delta: number };
    revenue: { current: number; prior: number; delta: number };
    net_profit: { current: number; prior: number; delta: number };
  } | null;
  profit_and_loss_lines: Array<{
    label: string;
    amount_yen: number;
    account_code?: string;
  }>;
  profit_and_loss: {
    revenue_total_yen: number;
    expense_total_yen: number;
    net_profit_yen: number;
  };
  bank_reconcile: {
    unmatched_count: number;
    unmatched: Array<{
      id: string;
      date: string;
      direction: string;
      amount: number;
    }>;
    proposals: Array<{
      bank_statement_id: string;
      ar_ap_id: string;
      amount: number;
      confidence: string;
    }>;
  };
  export_hint: string;
  export_urls: {
    journal_csv: string;
    trial_balance_csv: string;
    account_breakdown_csv: string;
    cash_flow_csv?: string;
  };
  dencho_search_path: string;
  journals: Array<{
    entry_id: string;
    occurred_at: string;
    description: string;
    source_kind: string;
  }>;
  subsidiaries: Array<{
    account_code: string;
    account_name: string;
    balanced: boolean;
    control_balance_yen: number;
    lines: Array<{ counterparty_id: string; balance_yen: number }>;
  }>;
  unposted_months: string[];
  period_locks: Array<{ month: string; status: string; by: string; at: string }>;
  monthly_reconcile: {
    month: string;
    gl_active: boolean;
    balanced: boolean;
    diffs: Array<{
      category: string;
      account_code: string;
      delta_yen: number;
    }>;
  };
  tax_balances: Array<{
    account_code: string;
    label: string;
    balance_yen: number;
  }>;
  remittance_calendar: Array<{
    row_id: string;
    label: string;
    deadline: string;
    obligation: string;
    amount_estimate_jpy: number | null;
  }>;
};

export function buildLedgerWorkbench(input?: {
  asOf?: string;
}): LedgerWorkbenchSnapshot {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const trial = buildTrialBalance({ asOf });
  const sheet = buildBalanceSheet({ asOf });
  const plSummary = buildGlProfitLossSummary({ asOf });
  const profit_and_loss_lines = plSummary.rows.map((row) => ({
    label: row.label,
    amount_yen: row.amount,
    account_code: row.account_code,
  }));
  const profit_and_loss = {
    revenue_total_yen: plSummary.revenue_total,
    expense_total_yen: plSummary.expense_total,
    net_profit_yen: plSummary.net_profit,
  };
  const journals = [...loadJournalEntries().entries]
    .filter((entry) => entry.occurred_at.slice(0, 10) <= asOf)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 25)
    .map((entry) => ({
      entry_id: entry.entry_id,
      occurred_at: entry.occurred_at.slice(0, 10),
      description: entry.description,
      source_kind: entry.source?.kind ?? "",
    }));

  const subsidiaries = ["1150", "2110"].flatMap((accountCode) => {
    try {
      const report = buildSubsidiaryLedger({ accountCode, asOf });
      return [
        {
          account_code: report.account_code,
          account_name: report.account_name,
          balanced: report.balanced,
          control_balance_yen: report.control_balance_yen,
          lines: report.lines.map((line) => ({
            counterparty_id: line.counterparty_id,
            balance_yen: line.balance_yen,
          })),
        },
      ];
    } catch {
      return [];
    }
  });

  const months = new Set(loadPeriodLocks().locks.map((lock) => lock.month));
  const period_locks = [...months]
    .sort()
    .map((month) => latestLockForMonth(month))
    .filter((lock): lock is NonNullable<typeof lock> => Boolean(lock))
    .map((lock) => ({
      month: lock.month,
      status: lock.status,
      by: lock.by,
      at: lock.at,
    }));

  const reconcileMonth = asOf.slice(0, 7);
  const reconcile = buildMonthlyReconcileReport({ month: reconcileMonth });

  const accounts = resolveJournalSourceAccounts();
  const taxSpecs: Array<{ code: string | undefined; label: string }> = [
    { code: accounts.consumption_tax_payable, label: "仮受消費税" },
    { code: accounts.consumption_tax_receivable, label: "仮払消費税" },
    { code: accounts.withholding_payable, label: "預り金（源泉）" },
    { code: accounts.social_insurance_payable, label: "未払社保" },
    { code: accounts.payroll_payable, label: "未払給与" },
  ];
  const tax_balances = taxSpecs
    .filter((row): row is { code: string; label: string } => Boolean(row.code))
    .map((row) => ({
      account_code: row.code,
      label: row.label,
      balance_yen:
        trial.rows.find((r) => r.account_code === row.code)?.balance_yen ?? 0,
    }));

  let remittance_calendar: LedgerWorkbenchSnapshot["remittance_calendar"] = [];
  try {
    const portfolio = buildTaxCalendarPortfolio({ today: asOf });
    remittance_calendar = portfolio.rows
      .map((row) => {
        const obligation = remittanceObligationFromCashflowCategory(
          row.cashflow_category,
        );
        if (!obligation) return null;
        return {
          row_id: row.id,
          label: row.tax,
          deadline: row.deadline,
          obligation,
          amount_estimate_jpy: row.amount_estimate_jpy,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .slice(0, 12);
  } catch {
    remittance_calendar = [];
  }

  let prior_compare: LedgerWorkbenchSnapshot["prior_compare"] = null;
  try {
    const endMonth = resolveCompanyFiscalYearEndMonth();
    const fiscalYear = resolveFiscalYear(endMonth, asOf.slice(0, 7));
    const cmpBs = buildComparativeBalanceSheet({ asOf, fiscalYear });
    const cmpPl = buildComparativeProfitLoss({ fiscalYear, asOf });
    prior_compare = {
      prior_as_of: cmpBs.prior_as_of,
      assets: cmpBs.total_assets_yen,
      liabilities: cmpBs.total_liabilities_yen,
      equity: cmpBs.total_equity_yen,
      net_income: cmpBs.net_income_yen,
      revenue: cmpPl.revenue_total,
      net_profit: cmpPl.net_profit,
    };
  } catch {
    prior_compare = null;
  }

  const bank_reconcile = listBankReconciliationWorkbench(asOf);
  const cashFlow = buildCashFlowStatement({ asOf });

  return {
    as_of: asOf,
    trial_balance: {
      balanced: trial.balanced,
      debit_total_yen: trial.debit_total_yen,
      credit_total_yen: trial.credit_total_yen,
      rows: trial.rows.map((row) => ({
        account_code: row.account_code,
        account_name: row.account_name,
        balance_yen: row.balance_yen,
      })),
    },
    balance_sheet: {
      balanced: sheet.balanced,
      total_assets_yen: sheet.total_assets_yen,
      total_liabilities_yen: sheet.total_liabilities_yen,
      total_equity_yen: sheet.total_equity_yen,
      net_income_yen: sheet.net_income_yen,
    },
    cash_flow: {
      method: cashFlow.method,
      net_cash_change_yen: cashFlow.net_cash_change_yen,
      cash_begin_yen: cashFlow.cash_begin_yen,
      cash_end_yen: cashFlow.cash_end_yen,
      reconciled: cashFlow.reconciled,
      operating_total_yen: cashFlow.operating.reduce((s, row) => s + row.amount_yen, 0),
      investing_total_yen: cashFlow.investing.reduce((s, row) => s + row.amount_yen, 0),
      financing_total_yen: cashFlow.financing.reduce((s, row) => s + row.amount_yen, 0),
    },
    prior_compare,
    profit_and_loss_lines,
    profit_and_loss,
    bank_reconcile,
    export_hint: `orgos ledger export --template account-breakdown-csv --as-of ${asOf}`,
    export_urls: {
      journal_csv: ledgerExportPath("journal-csv", asOf),
      trial_balance_csv: ledgerExportPath("trial-balance-csv", asOf),
      account_breakdown_csv: ledgerExportPath("account-breakdown-csv", asOf),
      cash_flow_csv: ledgerExportPath("cash-flow-csv", asOf),
    },
    dencho_search_path: `/chat/v1/ledger/dencho/search?from=2000-01-01&to=${asOf}`,
    journals,
    subsidiaries,
    unposted_months: unpostedMonthlyPlIssues(asOf.slice(0, 7)),
    period_locks,
    monthly_reconcile: {
      month: reconcile.as_of_month,
      gl_active: reconcile.gl_active,
      balanced: reconcile.balanced,
      diffs: reconcile.diffs.map((diff) => ({
        category: diff.category,
        account_code: diff.account_code,
        delta_yen: diff.delta_yen,
      })),
    },
    tax_balances,
    remittance_calendar,
  };
}
