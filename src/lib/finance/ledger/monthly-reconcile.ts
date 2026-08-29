import type { ChartOfAccounts, MonthlyFinance } from "../../../../schemas/finance/types.js";
import {
  loadChartOfAccounts,
  loadMonthlyFinances,
} from "../../data.js";
import { periodPlMovementByAccount } from "../gl-report-basis.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import { buildTrialBalance } from "./trial-balance.js";
import { loadOpeningBalances } from "./opening-balance.js";

const SKIP_RECONCILE_EXPENSE = new Set(["loan_payment", "capex"]);

export type MonthlyReconcileDiff = {
  month: string;
  category: string;
  account_code: string;
  monthly_pl_yen: number;
  trial_balance_yen: number;
  delta_yen: number;
};

export type MonthlyReconcileReport = {
  as_of_month: string;
  gl_active: boolean;
  diffs: MonthlyReconcileDiff[];
  balanced: boolean;
};

function monthlyExpenseByCategory(
  finances: MonthlyFinance[],
  month: string,
): Map<string, number> {
  const entry = finances.find((row) => row.month === month);
  const map = new Map<string, number>();
  if (!entry) return map;
  for (const expense of entry.expenses) {
    map.set(
      expense.category,
      (map.get(expense.category) ?? 0) + expense.amount,
    );
  }
  return map;
}

function monthlyRevenueByCategory(
  finances: MonthlyFinance[],
  month: string,
): Map<string, number> {
  const entry = finances.find((row) => row.month === month);
  const map = new Map<string, number>();
  if (!entry) return map;
  for (const revenue of entry.revenue) {
    map.set(
      revenue.category,
      (map.get(revenue.category) ?? 0) + revenue.amount,
    );
  }
  return map;
}

/** P/L + 仮受/仮払 on the same entry (税込) so monthly YAML 税込と突合できる。 */
function periodInclusivePlByAccount(
  month: string,
  coa: ChartOfAccounts,
): Map<string, number> {
  const base = periodPlMovementByAccount(month, coa);
  const taxCodes = new Set(
    [
      coa.journal_source_accounts?.consumption_tax_payable,
      coa.journal_source_accounts?.consumption_tax_receivable,
    ].filter((code): code is string => Boolean(code)),
  );
  if (taxCodes.size === 0) return base;

  const inclusive = new Map<string, number>();
  for (const [code, amount] of base) {
    inclusive.set(code, Math.abs(amount));
  }

  const start = `${month}-01`;
  const end = `${month}-31`;
  for (const entry of loadJournalEntries().entries) {
    const date = entry.occurred_at.slice(0, 10);
    if (date < start || date > end) continue;
    const plLines = entry.lines.filter((line) => base.has(line.account_code));
    const taxYen = entry.lines
      .filter((line) => taxCodes.has(line.account_code))
      .reduce((sum, line) => sum + line.debit_yen + line.credit_yen, 0);
    if (plLines.length === 1 && taxYen > 0) {
      const code = plLines[0]!.account_code;
      inclusive.set(code, (inclusive.get(code) ?? 0) + taxYen);
    }
  }
  return inclusive;
}

export function buildMonthlyReconcileReport(input: {
  month: string;
  coa?: ChartOfAccounts;
}): MonthlyReconcileReport {
  const opening = loadOpeningBalances();
  const glActive = Boolean(opening && input.month >= opening.period_start);
  if (!glActive) {
    return {
      as_of_month: input.month,
      gl_active: false,
      diffs: [],
      balanced: true,
    };
  }

  const coa = input.coa ?? loadChartOfAccounts();
  const finances = loadMonthlyFinances();
  const periodByAccount = periodInclusivePlByAccount(input.month, coa);
  // Trial balance retained for integrity / CLI diagnostics only.
  void buildTrialBalance({ asOf: `${input.month}-31` });

  const diffs: MonthlyReconcileDiff[] = [];
  const expenseCategories = monthlyExpenseByCategory(finances, input.month);
  for (const [category, amount] of expenseCategories) {
    if (SKIP_RECONCILE_EXPENSE.has(category)) continue;
    const accountCode = coa.category_mapping.expense[category as never];
    if (!accountCode) continue;
    const period = periodByAccount.get(accountCode) ?? 0;
    const delta = amount - Math.abs(period);
    if (delta !== 0) {
      diffs.push({
        month: input.month,
        category,
        account_code: accountCode,
        monthly_pl_yen: amount,
        trial_balance_yen: period,
        delta_yen: delta,
      });
    }
  }

  const revenueCategories = monthlyRevenueByCategory(finances, input.month);
  for (const [category, amount] of revenueCategories) {
    const accountCode = coa.category_mapping.revenue[category as never];
    if (!accountCode) continue;
    const period = periodByAccount.get(accountCode) ?? 0;
    const delta = amount - Math.abs(period);
    if (delta !== 0) {
      diffs.push({
        month: input.month,
        category,
        account_code: accountCode,
        monthly_pl_yen: amount,
        trial_balance_yen: period,
        delta_yen: delta,
      });
    }
  }

  return {
    as_of_month: input.month,
    gl_active: true,
    diffs,
    balanced: diffs.length === 0,
  };
}

export function monthlyReconcileIntegrityIssues(month: string): string[] {
  const opening = loadOpeningBalances();
  if (!opening || month < opening.period_start) return [];
  const report = buildMonthlyReconcileReport({ month });
  return report.diffs.map(
    (diff) =>
      `${diff.month} ${diff.category} (${diff.account_code}): monthly=${diff.monthly_pl_yen} trial=${diff.trial_balance_yen}`,
  );
}
