import { loadMonthlyFinances } from "../../data.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import {
  fiscalYearEndDate,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "../fiscal-year.js";
import { currentMonth } from "../../utils.js";
import { loadOpeningBalances } from "./opening-balance.js";

function hasMonthlyPlAmount(month: string): boolean {
  const row = loadMonthlyFinances().find((entry) => entry.month === month);
  if (!row) return false;
  const revenue = row.revenue.reduce((sum, line) => sum + line.amount, 0);
  const expense = row.expenses
    .filter(
      (line) =>
        line.category !== "depreciation" &&
        line.category !== "loan_payment" &&
        line.category !== "capex",
    )
    .reduce((sum, line) => sum + line.amount, 0);
  return revenue > 0 || expense > 0;
}

function hasMonthlyPlJournal(month: string): boolean {
  return loadJournalEntries().entries.some(
    (entry) =>
      entry.entry_id.startsWith(`JE-MPL-${month}-`) ||
      (entry.source?.kind === "closing" &&
        entry.source.period === month &&
        entry.source.adjustment_id.startsWith("monthly-pl-")),
  );
}

function enumerateMonths(fromMonth: string, toMonth: string): string[] {
  const months: string[] = [];
  let cursor = fromMonth;
  while (cursor <= toMonth) {
    months.push(cursor);
    const [year, month] = cursor.split("-").map(Number);
    cursor =
      month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, "0")}`;
    if (months.length > 36) break;
  }
  return months;
}

/** Months in the GL-active FY that have monthly YAML but no JE-MPL (variance, not fake books). */
export function unpostedMonthlyPlIssues(asOfMonth = currentMonth()): string[] {
  const opening = loadOpeningBalances();
  if (!opening) return [];
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fy = resolveFiscalYear(endMonth, asOfMonth);
  const fyEnd = fiscalYearEndDate(fy, endMonth).slice(0, 7);
  const start = opening.period_start;
  const last = asOfMonth < fyEnd ? asOfMonth : fyEnd;
  if (start > last) return [];

  const issues: string[] = [];
  for (const month of enumerateMonths(start, last)) {
    if (month > asOfMonth) continue;
    if (!hasMonthlyPlAmount(month)) continue;
    if (hasMonthlyPlJournal(month)) continue;
    issues.push(
      `${month}: monthly P/L is not posted to GL (予実差異 — do not fabricate journals)`,
    );
  }
  return issues;
}
