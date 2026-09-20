/**
 * Opt-in full-year demo journals for Ledger product pilots.
 * Default provision stays empty (first JE via onboarding).
 * Account codes are resolved from COA / journal_source_accounts (never orphan fixed codes).
 */
import { appendJournalEntry, loadJournalEntries, saveJournalEntries } from "../finance/expense-claim-journal.js";
import {
  fiscalYearStartMonth,
  resolveCompanyFiscalYearEndMonth,
} from "../finance/fiscal-year.js";
import {
  ensureLedgerDemoChartOfAccounts,
  resolveDemoYearAccountCodes,
} from "./ledger-coa-ensure.js";

function monthKeysForFiscalYear(fyLabel: string, yearEndMonth: number): string[] {
  const months: string[] = [];
  let cursor = fiscalYearStartMonth(fyLabel, yearEndMonth);
  for (let i = 0; i < 12; i += 1) {
    months.push(cursor);
    const [year, month] = cursor.split("-").map(Number);
    const next = new Date(year!, month!, 1);
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  }
  return months;
}

export function seedLedgerDemoYear(input?: {
  fiscalYear?: string;
  revenueYenPerMonth?: number;
  expenseYenPerMonth?: number;
  force?: boolean;
}): {
  fiscal_year: string;
  months: string[];
  posted_entry_ids: string[];
  skipped: boolean;
  account_codes?: ReturnType<typeof resolveDemoYearAccountCodes>;
} {
  const existing = loadJournalEntries().entries.length;
  if (existing > 0 && !input?.force) {
    return {
      fiscal_year: input?.fiscalYear ?? "FY2026",
      months: [],
      posted_entry_ids: [],
      skipped: true,
    };
  }

  if (input?.force && existing > 0) {
    const previous = process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
    process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = "1";
    try {
      saveJournalEntries(
        { version: 1, entries: [] },
        { mode: "migration" },
      );
    } finally {
      if (previous == null) delete process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
      else process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = previous;
    }
  }

  ensureLedgerDemoChartOfAccounts();
  const codes = resolveDemoYearAccountCodes();

  const fiscalYear = input?.fiscalYear ?? "FY2026";
  const yearEndMonth = resolveCompanyFiscalYearEndMonth();
  const months = monthKeysForFiscalYear(fiscalYear, yearEndMonth);
  const revenue = input?.revenueYenPerMonth ?? 300_000;
  const expense = input?.expenseYenPerMonth ?? 80_000;
  const posted: string[] = [];

  for (const period of months) {
    const revId = `JE-DEMO-${period}-REV`;
    const expId = `JE-DEMO-${period}-EXP`;
    appendJournalEntry(
      {
        entry_id: revId,
        occurred_at: `${period}-28T12:00:00.000Z`,
        description: `Demo monthly revenue ${period}`,
        source: {
          kind: "closing",
          period,
          adjustment_id: "demo-rev",
        },
        evidence_refs: [`demo:${period}`, "seed-demo-year"],
        lines: [
          {
            account_code: codes.bank_control,
            debit_yen: revenue,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: codes.revenue,
            debit_yen: 0,
            credit_yen: revenue,
            tax_category: "out_of_scope",
          },
        ],
      },
      { postedBy: "seed-demo-year" },
    );
    posted.push(revId);

    appendJournalEntry(
      {
        entry_id: expId,
        occurred_at: `${period}-28T12:30:00.000Z`,
        description: `Demo monthly expense ${period}`,
        source: {
          kind: "closing",
          period,
          adjustment_id: "demo-exp",
        },
        evidence_refs: [`demo:${period}`, "seed-demo-year"],
        lines: [
          {
            account_code: codes.expense,
            debit_yen: expense,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: codes.bank_control,
            debit_yen: 0,
            credit_yen: expense,
            tax_category: "out_of_scope",
          },
        ],
      },
      { postedBy: "seed-demo-year" },
    );
    posted.push(expId);
  }

  return {
    fiscal_year: fiscalYear,
    months,
    posted_entry_ids: posted,
    skipped: false,
    account_codes: codes,
  };
}
