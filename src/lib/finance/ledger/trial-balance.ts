import type { ChartOfAccounts } from "../../../../schemas/finance/types.js";
import {
  journalEntrySchema,
  normalizeJournalEntry,
} from "../../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts } from "../../data.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import { loadOpeningBalances } from "./opening-balance.js";

export type TrialBalanceRow = {
  account_code: string;
  account_name: string;
  normal_balance: "debit" | "credit";
  debit_total_yen: number;
  credit_total_yen: number;
  balance_yen: number;
};

export type TrialBalanceReport = {
  as_of: string;
  rows: TrialBalanceRow[];
  debit_total_yen: number;
  credit_total_yen: number;
  balanced: boolean;
  issues: string[];
};

function signedBalance(
  normalBalance: "debit" | "credit",
  debit: number,
  credit: number,
): number {
  const delta = debit - credit;
  return normalBalance === "debit" ? delta : -delta;
}

export function buildTrialBalance(input?: {
  asOf?: string;
  coa?: ChartOfAccounts;
}): TrialBalanceReport {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const coa = input?.coa ?? loadChartOfAccounts();
  const issues: string[] = [];
  const totals = new Map<string, { debit: number; credit: number }>();

  const opening = loadOpeningBalances();
  const openingAsOf = opening?.as_of;
  const includeOpening = Boolean(opening && openingAsOf && asOf >= openingAsOf);

  if (includeOpening && opening) {
    for (const line of opening.lines) {
      const bucket = totals.get(line.account_code) ?? { debit: 0, credit: 0 };
      bucket.debit += line.debit_yen;
      bucket.credit += line.credit_yen;
      totals.set(line.account_code, bucket);
    }
  }

  for (const raw of loadJournalEntries().entries) {
    const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
    const date = entry.occurred_at.slice(0, 10);
    if (date > asOf) continue;
    // Cutover: opening already reflects activity through opening.as_of.
    if (includeOpening && openingAsOf && date <= openingAsOf) continue;
    for (const line of entry.lines) {
      const bucket = totals.get(line.account_code) ?? { debit: 0, credit: 0 };
      bucket.debit += line.debit_yen;
      bucket.credit += line.credit_yen;
      totals.set(line.account_code, bucket);
    }
  }

  const accountByCode = new Map(coa.accounts.map((a) => [a.code, a]));
  const rows: TrialBalanceRow[] = [];

  for (const [accountCode, amount] of totals) {
    const account = accountByCode.get(accountCode);
    if (!account) {
      issues.push(`Unknown account code in journal: ${accountCode}`);
      continue;
    }
    rows.push({
      account_code: accountCode,
      account_name: account.name,
      normal_balance: account.normal_balance,
      debit_total_yen: amount.debit,
      credit_total_yen: amount.credit,
      balance_yen: signedBalance(
        account.normal_balance,
        amount.debit,
        amount.credit,
      ),
    });
  }

  rows.sort((a, b) => a.account_code.localeCompare(b.account_code));
  const debit_total_yen = rows.reduce((sum, row) => sum + row.debit_total_yen, 0);
  const credit_total_yen = rows.reduce(
    (sum, row) => sum + row.credit_total_yen,
    0,
  );
  const balanced = debit_total_yen === credit_total_yen;
  if (!balanced) {
    issues.push(
      `Trial balance not balanced: debit=${debit_total_yen} credit=${credit_total_yen}`,
    );
  }

  return {
    as_of: asOf,
    rows,
    debit_total_yen,
    credit_total_yen,
    balanced,
    issues,
  };
}

export function trialBalanceIntegrityIssues(): string[] {
  return buildTrialBalance().issues;
}
