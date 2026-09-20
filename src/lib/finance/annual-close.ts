/**
 * Annual accounting close.
 * Every month in the company fiscal year must already satisfy the monthly gates and be locked.
 * The P/L transfer is the only journal allowed into the locked final month.
 * The live opening-balances.yaml cutover is never replaced. The next opening is a side file.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { OpeningBalancesFile } from "../../../schemas/finance/opening-balances.js";
import { openingBalancesSchema } from "../../../schemas/finance/opening-balances.js";
import { loadChartOfAccounts } from "../data.js";
import { getDataDir, writeYamlFile } from "../utils.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import {
  fiscalYearEndDate,
  fiscalYearStartMonth,
  nextFiscalYear,
  resolveCompanyFiscalYearEndMonth,
} from "./fiscal-year.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { buildOpeningBalancesFromTrialBalance, saveOpeningBalances } from "./ledger/opening-balance.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { evaluateMonthlyCloseGates } from "./monthly-close.js";
import { isMonthLocked } from "./period-lock.js";

export type AnnualCloseMonthGate = {
  month: string;
  locked: boolean;
  can_lock: boolean;
};

export type AnnualCloseEvaluation = {
  fiscal_year: string;
  as_of: string;
  next_fiscal_year: string;
  next_period_start: string;
  months: AnnualCloseMonthGate[];
  can_close: boolean;
  errors: string[];
};

export type AnnualCloseResult = {
  ok: boolean;
  posted_entry_ids: string[];
  opening_proposal_path: string | null;
  evaluation: AnnualCloseEvaluation;
};

function assertFiscalYear(fiscalYear: string): void {
  if (!/^FY\d{4}$/.test(fiscalYear)) {
    throw new Error("fiscal year FY#### is required");
  }
}

export function listFiscalYearMonths(
  fiscalYear: string,
  fiscalYearEndMonth: number,
): string[] {
  const end = fiscalYearEndDate(fiscalYear, fiscalYearEndMonth).slice(0, 7);
  const months: string[] = [];
  let cursor = fiscalYearStartMonth(fiscalYear, fiscalYearEndMonth);
  for (let guard = 0; guard < 24; guard += 1) {
    months.push(cursor);
    if (cursor === end) return months;
    const [year, month] = cursor.split("-").map(Number);
    const next = new Date(year!, month!, 1);
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  }
  throw new Error(`Could not enumerate fiscal year ${fiscalYear}`);
}

export function proposedOpeningBalancesPath(nextFiscalYearId: string): string {
  return join(getDataDir(), "finance", `opening-balances.${nextFiscalYearId}.yaml`);
}

export function evaluateAnnualCloseGates(fiscalYear: string): AnnualCloseEvaluation {
  assertFiscalYear(fiscalYear);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, endMonth);
  const next = nextFiscalYear(fiscalYear);
  const months = listFiscalYearMonths(fiscalYear, endMonth);
  const errors: string[] = [];
  const monthGates: AnnualCloseMonthGate[] = [];
  for (const month of months) {
    const locked = isMonthLocked(month);
    const gates = evaluateMonthlyCloseGates(month);
    if (!locked) errors.push(`${month}: unlocked`);
    if (!gates.can_lock) {
      errors.push(...gates.errors.map((issue) => `${month}: ${issue}`));
    }
    monthGates.push({ month, locked, can_lock: gates.can_lock });
  }
  return {
    fiscal_year: fiscalYear,
    as_of: asOf,
    next_fiscal_year: next,
    next_period_start: fiscalYearStartMonth(next, endMonth),
    months: monthGates,
    can_close: errors.length === 0,
    errors,
  };
}

function postAnnualPlTransfer(input: {
  fiscalYear: string;
  asOf: string;
}): string | null {
  const coa = loadChartOfAccounts();
  const accounts = resolveJournalSourceAccounts(coa);
  const trial = buildTrialBalance({ asOf: input.asOf });
  const lines: Array<{
    account_code: string;
    debit_yen: number;
    credit_yen: number;
    tax_category: "out_of_scope";
  }> = [];
  let revenueTotal = 0;
  let expenseTotal = 0;

  for (const row of trial.rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (!account || row.balance_yen === 0) continue;
    if (account.type === "revenue") {
      const amount = Math.abs(row.balance_yen);
      revenueTotal += amount;
      lines.push({
        account_code: row.account_code,
        debit_yen: amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    if (account.type === "expense") {
      const amount = Math.abs(row.balance_yen);
      expenseTotal += amount;
      lines.push({
        account_code: row.account_code,
        debit_yen: 0,
        credit_yen: amount,
        tax_category: "out_of_scope",
      });
    }
  }

  const netToRetained = revenueTotal - expenseTotal;
  if (netToRetained > 0) {
    lines.push({
      account_code: accounts.retained_earnings,
      debit_yen: 0,
      credit_yen: netToRetained,
      tax_category: "out_of_scope",
    });
  } else if (netToRetained < 0) {
    lines.push({
      account_code: accounts.retained_earnings,
      debit_yen: -netToRetained,
      credit_yen: 0,
      tax_category: "out_of_scope",
    });
  }
  if (lines.length < 2) return null;

  const entryId = `JE-CLOSE-${input.fiscalYear}-PL-TRANSFER`;
  appendJournalEntry(
    {
      entry_id: entryId,
      occurred_at: `${input.asOf}T23:59:59.000Z`,
      description: `Annual P/L transfer ${input.fiscalYear}`,
      source: {
        kind: "closing",
        period: input.asOf.slice(0, 7),
        adjustment_id: "pl-transfer",
      },
      evidence_refs: [`annual-close:${input.fiscalYear}`],
      lines,
    },
    { allowAnnualPlTransfer: true },
  );
  return entryId;
}

function writeOpeningProposal(file: OpeningBalancesFile, nextFiscalYearId: string): string {
  const path = proposedOpeningBalancesPath(nextFiscalYearId);
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(path, openingBalancesSchema.parse(file));
  return path;
}

/**
 * Post the P/L transfer and switch the live opening file only when every gate passes.
 * A failed close leaves journals and the live opening file unchanged.
 */
export function closeAccountingYear(input: {
  fiscalYear: string;
  operatorId: string;
}): AnnualCloseResult {
  assertFiscalYear(input.fiscalYear);
  const evaluation = evaluateAnnualCloseGates(input.fiscalYear);
  if (!evaluation.can_close) {
    return {
      ok: false,
      posted_entry_ids: [],
      opening_proposal_path: null,
      evaluation,
    };
  }
  const before = new Set(loadJournalEntries().entries.map((entry) => entry.entry_id));
  const transferId = postAnnualPlTransfer({
    fiscalYear: input.fiscalYear,
    asOf: evaluation.as_of,
  });
  const posted = transferId && !before.has(transferId) ? [transferId] : [];
  const opening = buildOpeningBalancesFromTrialBalance({
    fiscalYear: evaluation.next_fiscal_year,
    asOf: evaluation.as_of,
    periodStart: evaluation.next_period_start,
    bsOnly: true,
    notes: `Opened by annual close ${input.fiscalYear} · authorized_by ${input.operatorId}`,
  });
  const proposalPath = writeOpeningProposal(opening, evaluation.next_fiscal_year);
  saveOpeningBalances(opening);
  return {
    ok: true,
    posted_entry_ids: posted,
    opening_proposal_path: proposalPath,
    evaluation,
  };
}
