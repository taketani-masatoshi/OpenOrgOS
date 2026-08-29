import {
  journalEntrySchema,
  normalizeJournalEntry,
} from "../../../schemas/finance/journal-entry.js";
import type { ChartOfAccounts } from "../../../schemas/finance/types.js";
import { loadChartOfAccounts } from "../data.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import { loadYojitsuFyPlan } from "../data.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import type { PdfTableRow } from "../pdf.js";
import { resolveFiscalYearEndAsOf } from "./fiscal-year.js";
import type { StatementSection } from "../../../schemas/finance/chart-of-accounts.js";

export type GlPlRow = {
  label: string;
  amount: number;
  account_code?: string;
  statement_section?: StatementSection;
};

export type GlStatementTotals = {
  revenue_total: number;
  cogs_total: number;
  sga_total: number;
  gross_profit: number;
  operating_profit: number;
  non_operating_income: number;
  non_operating_expense: number;
  ordinary_profit: number;
  extraordinary: number;
  pretax_profit: number;
  income_tax: number;
  net_profit: number;
};

export type GlPlSummary = {
  revenue_total: number;
  expense_total: number;
  operating_profit: number;
  ordinary_profit: number;
  pretax_profit: number;
  net_profit: number;
  basis: "gl";
  as_of: string;
  rows: GlPlRow[];
};

export type GlMonthlyActual = {
  month: string;
  revenue_total: number;
  expense_total: number;
  operating_profit: number;
};

function inferStatementSection(
  account: { type: string; statement_section?: StatementSection },
): StatementSection | undefined {
  if (account.statement_section) return account.statement_section;
  if (account.type === "revenue") return "revenue";
  if (account.type === "expense") return "sga";
  return undefined;
}

/** P/L movement in a single calendar month (not cumulative trial balance). */
export function periodPlMovementByAccount(
  month: string,
  coa?: ChartOfAccounts,
): Map<string, number> {
  const chart = coa ?? loadChartOfAccounts();
  const start = `${month}-01`;
  const end = `${month}-31`;
  const movement = new Map<string, number>();
  const plAccounts = new Set(
    chart.accounts
      .filter((a) => a.type === "revenue" || a.type === "expense")
      .map((a) => a.code),
  );

  for (const raw of loadJournalEntries().entries) {
    const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
    const date = entry.occurred_at.slice(0, 10);
    if (date < start || date > end) continue;
    for (const line of entry.lines) {
      if (!plAccounts.has(line.account_code)) continue;
      const account = chart.accounts.find((a) => a.code === line.account_code);
      if (!account) continue;
      const delta =
        account.normal_balance === "debit"
          ? line.debit_yen - line.credit_yen
          : line.credit_yen - line.debit_yen;
      movement.set(line.account_code, (movement.get(line.account_code) ?? 0) + delta);
    }
  }
  return movement;
}

function summarizePeriodMovement(movement: Map<string, number>, coa: ChartOfAccounts) {
  let revenueTotal = 0;
  let expenseTotal = 0;
  for (const [code, amount] of movement) {
    const account = coa.accounts.find((a) => a.code === code);
    if (!account) continue;
    if (account.type === "revenue") revenueTotal += Math.abs(amount);
    if (account.type === "expense") expenseTotal += Math.abs(amount);
  }
  return { revenueTotal, expenseTotal, operating_profit: revenueTotal - expenseTotal };
}

/** Monthly actuals derived from GL — sole authoritative actuals entry point. */
export function buildGlMonthlyActuals(fiscalYear: string): GlMonthlyActual[] {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  const coa = loadChartOfAccounts();
  const months = (yojitsu?.months ?? []).map((m) => m.month).sort();
  return months.map((month) => {
    const movement = periodPlMovementByAccount(month, coa);
    const summary = summarizePeriodMovement(movement, coa);
    return {
      month,
      revenue_total: summary.revenueTotal,
      expense_total: summary.expenseTotal,
      operating_profit: summary.operating_profit,
    };
  });
}

export function buildGlProfitLossSummary(input: {
  fiscalYear?: string;
  asOf?: string;
  coa?: ChartOfAccounts;
}): GlPlSummary {
  const asOf =
    input.asOf ??
    (input.fiscalYear
      ? resolveFiscalYearEndAsOf(input.fiscalYear)
      : new Date().toISOString().slice(0, 10));
  const trial = buildTrialBalance({ asOf });
  const coa = input.coa ?? loadChartOfAccounts();
  const rows: GlPlRow[] = [];
  let expenseTotal = 0;

  for (const row of trial.rows) {
    const account = coa.accounts.find((a) => a.code === row.account_code);
    if (!account) continue;
    if (account.type === "revenue") {
      const amount = Math.abs(row.balance_yen);
      rows.push({
        label: account.name,
        amount,
        account_code: row.account_code,
        statement_section: inferStatementSection(account),
      });
    }
    if (account.type === "expense") {
      const amount = Math.abs(row.balance_yen);
      expenseTotal += amount;
      rows.push({
        label: account.name,
        amount,
        account_code: row.account_code,
        statement_section: inferStatementSection(account),
      });
    }
  }

  const statement = summarizeGlStatementSections(rows);
  return {
    revenue_total: statement.revenue_total,
    expense_total: expenseTotal,
    operating_profit: statement.operating_profit,
    ordinary_profit: statement.ordinary_profit,
    pretax_profit: statement.pretax_profit,
    net_profit: statement.net_profit,
    basis: "gl",
    as_of: asOf,
    rows,
  };
}

function sectionTotal(rows: GlPlRow[], section: StatementSection): number {
  return rows
    .filter((row) => row.statement_section === section)
    .reduce((sum, row) => sum + row.amount, 0);
}

/** Shared BS/PL totals — net_profit is after income tax, not operating profit. */
export function summarizeGlStatementSections(rows: GlPlRow[]): GlStatementTotals {
  const revenue_total = sectionTotal(rows, "revenue");
  const cogs_total = sectionTotal(rows, "cogs");
  const sga_total = sectionTotal(rows, "sga");
  const non_operating_income = sectionTotal(rows, "non_operating_income");
  const non_operating_expense = sectionTotal(rows, "non_operating_expense");
  const extraordinary = sectionTotal(rows, "extraordinary");
  const income_tax = sectionTotal(rows, "income_tax");
  const gross_profit = revenue_total - cogs_total;
  const operating_profit = gross_profit - sga_total;
  const ordinary_profit = operating_profit + non_operating_income - non_operating_expense;
  const pretax_profit = ordinary_profit - extraordinary;
  const net_profit = pretax_profit - income_tax;
  return {
    revenue_total,
    cogs_total,
    sga_total,
    gross_profit,
    operating_profit,
    non_operating_income,
    non_operating_expense,
    ordinary_profit,
    extraordinary,
    pretax_profit,
    income_tax,
    net_profit,
  };
}

export function buildGlKessanPlRows(input: {
  fiscalYear: string;
  asOf?: string;
  priorAsOf?: string;
  priorFiscalYear?: string;
}): PdfTableRow[] {
  const summary = buildGlProfitLossSummary(input);
  const priorSummary =
    input.priorAsOf && input.priorFiscalYear
      ? buildGlProfitLossSummary({
          fiscalYear: input.priorFiscalYear,
          asOf: input.priorAsOf,
        })
      : null;
  const current = summarizeGlStatementSections(summary.rows);
  const prior = priorSummary
    ? summarizeGlStatementSections(priorSummary.rows)
    : null;
  const priorByLabel = new Map(
    priorSummary?.rows.map((row) => [row.label, row.amount]) ?? [],
  );

  const pushRows = (rows: PdfTableRow[], section: StatementSection, title: string) => {
    rows.push({ label: title, amount: "", variant: "section" });
    for (const row of summary.rows.filter((r) => r.statement_section === section && r.amount > 0)) {
      rows.push({
        label: row.label,
        amount: row.amount,
        ...(prior ? { priorAmount: priorByLabel.get(row.label) ?? 0 } : {}),
        indent: 1,
        variant: "muted",
      });
    }
  };

  const pair = (amount: number, priorAmount: number | undefined) =>
    prior != null ? { amount, priorAmount: priorAmount ?? 0 } : { amount };

  const rows: PdfTableRow[] = [];
  if (prior) {
    rows.push({
      label: "（当期 / 前期）",
      amount: summary.as_of,
      priorAmount: priorSummary!.as_of,
      variant: "muted",
    });
  }
  pushRows(rows, "revenue", "Ⅰ. 売上高");
  rows.push({
    label: "売上高合計",
    ...pair(current.revenue_total, prior?.revenue_total),
    variant: "total",
  });
  pushRows(rows, "cogs", "Ⅱ. 売上原価");
  rows.push({
    label: "売上総利益",
    ...pair(current.gross_profit, prior?.gross_profit),
    variant: "total",
  });
  pushRows(rows, "sga", "Ⅲ. 販売費及び一般管理費");
  rows.push({
    label: "販管費合計",
    ...pair(current.sga_total, prior?.sga_total),
    variant: "total",
  });
  rows.push({
    label: "Ⅳ. 営業利益",
    ...pair(current.operating_profit, prior?.operating_profit),
    variant: "emphasis",
  });
  pushRows(rows, "non_operating_income", "Ⅴ. 営業外収益");
  pushRows(rows, "non_operating_expense", "営業外費用");
  rows.push({
    label: "経常利益",
    ...pair(current.ordinary_profit, prior?.ordinary_profit),
    variant: "total",
  });
  pushRows(rows, "extraordinary", "Ⅵ. 特別損益");
  rows.push({
    label: "税引前当期純利益",
    ...pair(current.pretax_profit, prior?.pretax_profit),
    variant: "total",
  });
  pushRows(rows, "income_tax", "法人税等");
  rows.push({
    label: "当期純利益",
    ...pair(current.net_profit, prior?.net_profit),
    variant: "emphasis",
  });
  return rows;
}
