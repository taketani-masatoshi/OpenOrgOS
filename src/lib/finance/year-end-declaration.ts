/**
 * Year-end declarations. Amounts are never invented.
 * Missing file, or a counted inventory / unsettled consumption tax / unposted accrual, blocks the annual close.
 */
import { loadJournalEntries } from "./expense-claim-journal.js";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  resolveCompanyFiscalYearEndMonth,
} from "./fiscal-year.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { evaluateInventoryCloseGate } from "./monthly-close.js";
import { readYearEndDeclaration } from "./year-end-file.js";

export { readYearEndDeclaration, yearEndDeclarationPath } from "./year-end-file.js";

export function evaluateYearEndDeclaration(fiscalYear: string): { errors: string[] } {
  const declaration = readYearEndDeclaration(fiscalYear);
  if (!declaration.ok) return { errors: declaration.errors };
  const errors: string[] = [];
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, endMonth);
  const start = fiscalYearStartDate(fiscalYear, endMonth);
  const yearEndMonth = asOf.slice(0, 7);

  if (declaration.value.inventory === "none") {
    /* explicit: no inventory count required */
  } else {
    const inventory = evaluateInventoryCloseGate(yearEndMonth, asOf);
    if (!inventory.pass || inventory.level === "skip") {
      errors.push(`inventory: ${inventory.detail ?? "count missing"}`);
    }
  }

  const entries = loadJournalEntries().entries.filter((entry) => {
    const date = entry.occurred_at.slice(0, 10);
    return date >= start && date <= asOf;
  });
  for (const line of declaration.value.accruals) {
    if (line.amount_yen === 0) continue;
    const posted = entries.some((entry) => {
      if (entry.source?.kind !== "closing" || entry.source.adjustment_id !== line.id) {
        return false;
      }
      const debit = entry.lines.reduce((sum, row) => sum + row.debit_yen, 0);
      return debit === line.amount_yen;
    });
    if (!posted) errors.push(`accrual not posted ${line.id}`);
  }

  if (declaration.value.consumption_tax === "settled") {
    let payable: string | undefined;
    let receivable: string | undefined;
    try {
      const accounts = resolveJournalSourceAccounts();
      payable = accounts.consumption_tax_payable;
      receivable = accounts.consumption_tax_receivable;
    } catch {
      payable = undefined;
    }
    const codes = new Set([payable, receivable].filter((code): code is string => Boolean(code)));
    const settled = entries.some((entry) => {
      if (
        entry.source?.kind === "remittance" &&
        entry.source.obligation === "consumption_tax"
      ) {
        return true;
      }
      return entry.lines.some((line) => codes.has(line.account_code));
    });
    if (!settled) errors.push("consumption tax settlement missing");
  }

  return { errors };
}
