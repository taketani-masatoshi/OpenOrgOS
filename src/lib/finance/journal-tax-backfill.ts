import {
  journalEntrySchema,
  normalizeJournalEntry,
  type TaxCategory,
} from "../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts } from "../data.js";
import {
  loadJournalEntries,
  saveJournalEntries,
} from "./expense-claim-journal.js";

const DEFAULT_EXPENSE_TAX: TaxCategory = "taxable_10";
const DEFAULT_REVENUE_TAX: TaxCategory = "taxable_10";
const DEFAULT_LIABILITY_TAX: TaxCategory = "out_of_scope";

function defaultTaxForAccount(accountCode: string): TaxCategory {
  const coa = loadChartOfAccounts();
  const account = coa.accounts.find((a) => a.code === accountCode);
  if (!account) return DEFAULT_EXPENSE_TAX;
  if (account.type === "revenue") return DEFAULT_REVENUE_TAX;
  if (account.type === "liability" || account.type === "equity") {
    return DEFAULT_LIABILITY_TAX;
  }
  if (account.type === "asset") return "out_of_scope";
  return DEFAULT_EXPENSE_TAX;
}

export type JournalTaxBackfillResult = {
  updated_entries: number;
  updated_lines: number;
  dry_run: boolean;
};

const journalEntryBackfillSchema = journalEntrySchema
  .innerType()
  .superRefine((entry, ctx) => {
    const debit = entry.lines.reduce((sum, line) => sum + line.debit_yen, 0);
    const credit = entry.lines.reduce((sum, line) => sum + line.credit_yen, 0);
    if (debit !== credit || debit === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: `journal entry must balance (debit=${debit}, credit=${credit})`,
      });
    }
  });

export function backfillJournalTaxCategories(input?: {
  dryRun?: boolean;
}): JournalTaxBackfillResult {
  const file = loadJournalEntries();
  let updatedEntries = 0;
  let updatedLines = 0;
  const nextEntries = file.entries.map((raw) => {
    const entry = journalEntryBackfillSchema.parse(normalizeJournalEntry(raw));
    let changed = false;
    const lines = entry.lines.map((line) => {
      if (line.tax_category) return line;
      changed = true;
      updatedLines += 1;
      return {
        ...line,
        tax_category: defaultTaxForAccount(line.account_code),
      };
    });
    if (!changed) return entry;
    updatedEntries += 1;
    return { ...entry, lines };
  });

  if (!input?.dryRun && updatedEntries > 0) {
    saveJournalEntries({ ...file, entries: nextEntries }, { mode: "migration" });
  }

  return {
    updated_entries: updatedEntries,
    updated_lines: updatedLines,
    dry_run: Boolean(input?.dryRun),
  };
}
