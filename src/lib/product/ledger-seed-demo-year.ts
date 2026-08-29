/**
 * Opt-in full-year demo journals for Ledger product pilots.
 * Default provision stays empty (first JE via onboarding).
 * Account codes are resolved from COA / journal_source_accounts (never orphan fixed codes).
 */
import { appendJournalEntry, loadJournalEntries, saveJournalEntries } from "../finance/expense-claim-journal.js";
import { resolveCompanyFiscalYearEndMonth } from "../finance/fiscal-year.js";
import { getClock } from "../runtime-context.js";
import {
  ensureLedgerDemoChartOfAccounts,
  resolveDemoYearAccountCodes,
} from "./ledger-coa-ensure.js";

function monthKeysForFiscalYear(fyLabel: string, yearEndMonth: number): string[] {
  const match = fyLabel.match(/(\d{4})/);
  const endYear = match ? Number(match[1]) : getClock().now().getUTCFullYear();
  const startMonth = (yearEndMonth % 12) + 1;
  const startYear = startMonth === 1 ? endYear : endYear - 1;
  const months: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < 12; i += 1) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
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
    saveJournalEntries(
      { version: 1, entries: [] },
      { mode: "migration" },
    );
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
