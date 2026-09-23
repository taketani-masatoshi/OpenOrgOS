/**
 * Bank statement versus GL tie-out for monthly close.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadChartOfAccounts } from "../data.js";
import { getDataDir } from "../utils.js";
import { loadBankStatementsLite, bankStatementNetMovement } from "./bank-statements-lite.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import {
  fiscalYearStartMonth,
  lastDayOfMonth,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "./fiscal-year.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { loadOpeningBalances } from "./ledger/opening-balance.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";

export function previousMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year!, monthNumber! - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isFirstFiscalMonth(month: string): boolean {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear = resolveFiscalYear(endMonth, month);
  return fiscalYearStartMonth(fiscalYear, endMonth) === month;
}

export function bankRowsForMonth(month: string): number | "missing" | "unreadable" {
  if (!bankFileExists()) return "missing";
  const lite = loadBankStatementsLite();
  if (!lite) return "unreadable";
  return lite.entries.filter((row) => row.date.slice(0, 7) === month).length;
}
export function bankFileExists(): boolean {
  return existsSync(join(getDataDir(), "finance", "bank-statements.yaml"));
}

function cashBalanceFileExists(): boolean {
  return existsSync(join(getDataDir(), "finance", "cash-balance.yaml"));
}

/** A cash register or a statement file means the tenant uses a bank. */
export function tenantUsesBank(): boolean {
  return cashBalanceFileExists() || bankFileExists();
}

/**
 * Exclusive start of the month's bank-versus-GL window.
 * The first fiscal month starts at the opening cutover when that date is
 * before the month ends. A later cutover is not this month's window.
 */
/** Exclusive start of the month's bank-versus-GL window (also used by close gates). */
export function tieOutFromExclusive(month: string): string {
  if (isFirstFiscalMonth(month)) {
    const openingAsOf = loadOpeningBalances()?.as_of;
    if (openingAsOf && openingAsOf < lastDayOfMonth(month)) return openingAsOf;
  }
  return lastDayOfMonth(previousMonth(month));
}

/** Opening cash that first appears on the trial balance inside the window. */
export function openingCashInWindow(fromExclusive: string, toInclusive: string): number {
  const opening = loadOpeningBalances();
  if (!opening?.as_of || opening.as_of <= fromExclusive || opening.as_of > toInclusive) return 0;
  const code = resolveJournalSourceAccounts().bank_control;
  const line = opening.lines.find((row) => row.account_code === code);
  if (!line) return 0;
  const normal = loadChartOfAccounts().accounts.find((account) => account.code === code)
    ?.normal_balance;
  const delta = line.debit_yen - line.credit_yen;
  return normal === "credit" ? -delta : delta;
}

/** Cash-account movement on the trial balance for the tie-out window. */
export function monthCashGlDelta(month: string): number {
  const fromExclusive = tieOutFromExclusive(month);
  const toInclusive = lastDayOfMonth(month);
  return (
    cashBalanceYen(toInclusive) -
    cashBalanceYen(fromExclusive) -
    openingCashInWindow(fromExclusive, toInclusive)
  );
}

export function cashBalanceYen(asOf: string): number {
  const code = resolveJournalSourceAccounts().bank_control;
  return (
    buildTrialBalance({ asOf }).rows.find((row) => row.account_code === code)?.balance_yen ?? 0
  );
}

export function cashJournalNet(fromExclusive: string, toInclusive: string): number {
  const code = resolveJournalSourceAccounts().bank_control;
  let net = 0;
  for (const entry of loadJournalEntries().entries) {
    const record = entry as {
      voided_at?: string;
      status?: string;
      occurred_at: string;
      lines: Array<{ account_code: string; debit_yen: number; credit_yen: number }>;
    };
    if (record.voided_at || record.status === "void") continue;
    const date = record.occurred_at.slice(0, 10);
    if (date <= fromExclusive || date > toInclusive) continue;
    for (const line of record.lines) {
      if (line.account_code !== code) continue;
      net += line.debit_yen - line.credit_yen;
    }
  }
  return net;
}

export type MonthBankTieOut = {
  glDelta: number | null;
  bankNet: number | null;
  pass: boolean;
  detail: string;
};

export function monthBankTieOut(month: string): MonthBankTieOut {
  const rows = bankRowsForMonth(month);
  if (!tenantUsesBank()) {
    return { glDelta: null, bankNet: null, pass: true, detail: "no bank" };
  }
  if (rows === "missing") {
    return { glDelta: null, bankNet: null, pass: false, detail: "no bank file" };
  }
  if (rows === "unreadable") {
    return { glDelta: null, bankNet: null, pass: false, detail: "bank statements unreadable" };
  }
  if (rows === 0) {
    return { glDelta: null, bankNet: null, pass: false, detail: "no bank rows for month" };
  }
  const file = loadBankStatementsLite();
  if (!file) {
    return { glDelta: null, bankNet: null, pass: false, detail: "bank statements unreadable" };
  }
  const fromExclusive = tieOutFromExclusive(month);
  const toInclusive = lastDayOfMonth(month);
  const glDelta = monthCashGlDelta(month);
  const bankNet = bankStatementNetMovement(file, fromExclusive, toInclusive);
  if (glDelta !== bankNet) {
    return {
      glDelta,
      bankNet,
      pass: false,
      detail: `GL delta ${glDelta} != bank net ${bankNet}`,
    };
  }
  return { glDelta, bankNet, pass: true, detail: "ok" };
}
/** Unmatched bank rows in the close month. null = no bank file. */
export function unmatchedBankCountForMonth(month: string): number | null {
  if (!bankFileExists()) return null;
  const lite = loadBankStatementsLite();
  if (!lite) return Number.POSITIVE_INFINITY;
  return lite.entries.filter(
    (row) => row.date.slice(0, 7) === month && (!row.status || row.status === "unmatched"),
  ).length;
}
