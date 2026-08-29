import type { ChartOfAccounts } from "../../../../schemas/finance/types.js";
import {
  journalEntrySchema,
  normalizeJournalEntry,
  type JournalEntry,
} from "../../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts } from "../../data.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import type { OpeningBalancesFile } from "../../../../schemas/finance/opening-balances.js";
import { loadOpeningBalances } from "./opening-balance.js";

export type LedgerLine = {
  entry_id: string;
  occurred_at: string;
  description: string;
  account_code: string;
  debit_yen: number;
  credit_yen: number;
  running_balance_yen: number;
};

export type AccountLedger = {
  account_code: string;
  account_name: string;
  normal_balance: "debit" | "credit";
  lines: LedgerLine[];
  ending_balance_yen: number;
};

function accountMap(coa: ChartOfAccounts): Map<
  string,
  { name: string; normal_balance: "debit" | "credit" }
> {
  return new Map(
    coa.accounts.map((account) => [
      account.code,
      { name: account.name, normal_balance: account.normal_balance },
    ]),
  );
}

function signedAmount(
  normalBalance: "debit" | "credit",
  debit: number,
  credit: number,
): number {
  const delta = debit - credit;
  return normalBalance === "debit" ? delta : -delta;
}

function flattenEntries(entries: JournalEntry[]): Array<{
  entry_id: string;
  occurred_at: string;
  description: string;
  account_code: string;
  debit_yen: number;
  credit_yen: number;
}> {
  const rows: Array<{
    entry_id: string;
    occurred_at: string;
    description: string;
    account_code: string;
    debit_yen: number;
    credit_yen: number;
  }> = [];
  for (const raw of entries) {
    const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
    for (const line of entry.lines) {
      rows.push({
        entry_id: entry.entry_id,
        occurred_at: entry.occurred_at,
        description: entry.description,
        account_code: line.account_code,
        debit_yen: line.debit_yen,
        credit_yen: line.credit_yen,
      });
    }
  }
  return rows.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

function openingRows(
  opening: OpeningBalancesFile | null,
  accountCode?: string,
): Array<{
  entry_id: string;
  occurred_at: string;
  description: string;
  account_code: string;
  debit_yen: number;
  credit_yen: number;
}> {
  if (!opening) return [];
  return opening.lines
    .filter((line) => !accountCode || line.account_code === accountCode)
    .map((line) => ({
      entry_id: "OPENING",
      occurred_at: `${opening.as_of}T00:00:00.000Z`,
      description: `Opening balance ${opening.fiscal_year}`,
      account_code: line.account_code,
      debit_yen: line.debit_yen,
      credit_yen: line.credit_yen,
    }));
}

export function buildGeneralLedger(input: {
  accountCode: string;
  from?: string;
  to?: string;
  coa?: ChartOfAccounts;
  opening?: OpeningBalancesFile | null;
}): AccountLedger {
  const coa = input.coa ?? loadChartOfAccounts();
  const meta = accountMap(coa).get(input.accountCode);
  if (!meta) {
    throw new Error(`Unknown account code: ${input.accountCode}`);
  }

  const opening = input.opening ?? loadOpeningBalances();
  const journal = loadJournalEntries().entries;
  const rows = [
    ...openingRows(opening, input.accountCode),
    ...flattenEntries(journal).filter(
      (row) => row.account_code === input.accountCode,
    ),
  ].filter((row) => {
    const date = row.occurred_at.slice(0, 10);
    if (input.from && date < input.from) return false;
    if (input.to && date > input.to) return false;
    return true;
  });

  let running = 0;
  const lines: LedgerLine[] = rows.map((row) => {
    running += signedAmount(
      meta.normal_balance,
      row.debit_yen,
      row.credit_yen,
    );
    return { ...row, running_balance_yen: running };
  });

  return {
    account_code: input.accountCode,
    account_name: meta.name,
    normal_balance: meta.normal_balance,
    lines,
    ending_balance_yen: running,
  };
}

export function listJournalEntries(input?: {
  from?: string;
  to?: string;
  accountCode?: string;
  sourceKind?: string;
}): JournalEntry[] {
  return loadJournalEntries().entries
    .map((entry) => journalEntrySchema.parse(normalizeJournalEntry(entry)))
    .filter((entry) => {
      const date = entry.occurred_at.slice(0, 10);
      if (input?.from && date < input.from) return false;
      if (input?.to && date > input.to) return false;
      const source = normalizeJournalEntry(entry).source;
      if (input?.sourceKind && source?.kind !== input.sourceKind) return false;
      if (
        input?.accountCode &&
        !entry.lines.some((line) => line.account_code === input.accountCode)
      ) {
        return false;
      }
      return true;
    });
}
