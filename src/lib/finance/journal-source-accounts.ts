import type { ChartOfAccounts, JournalSourceAccounts } from "../../../schemas/finance/types.js";
import { loadChartOfAccounts } from "../data.js";

export type { JournalSourceAccounts };

function assertAccountExists(coa: ChartOfAccounts, code: string): void {
  const found = coa.accounts.some((account) => account.code === code);
  if (!found) {
    throw new Error(
      `journal_source_accounts references unknown account ${code} — update chart-of-accounts.yaml`,
    );
  }
}

export function resolveJournalSourceAccounts(
  coa: ChartOfAccounts = loadChartOfAccounts(),
): JournalSourceAccounts {
  const mapping = coa.journal_source_accounts;
  if (!mapping) {
    throw new Error(
      "chart-of-accounts.yaml is missing journal_source_accounts — required for automated journal posting",
    );
  }
  for (const code of Object.values(mapping)) {
    if (typeof code === "string") assertAccountExists(coa, code);
  }
  return mapping;
}
