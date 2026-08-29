import { buildTrialBalance } from "./ledger/trial-balance.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { buildTaxCalendarPortfolio } from "./tax-calendar-portfolio.js";
import { remittanceObligationFromCashflowCategory } from "./remittance-from-calendar.js";

export type RemittanceIntegrityIssue = {
  level: "warning" | "error";
  message: string;
};

/**
 * Unpaid statutory remittances past calendar deadline → integrity error.
 * withholding / social_insurance payable balances with overdue calendar rows.
 */
export function remittanceIntegrityIssues(input?: {
  asOf?: string;
}): RemittanceIntegrityIssue[] {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const issues: RemittanceIntegrityIssue[] = [];
  const accounts = resolveJournalSourceAccounts();
  const trial = buildTrialBalance({ asOf });
  const balanceOf = (code: string | undefined) =>
    code
      ? Math.abs(
          trial.rows.find((row) => row.account_code === code)?.balance_yen ?? 0,
        )
      : 0;

  const withholdingBal = balanceOf(accounts.withholding_payable);
  const socialBal = balanceOf(accounts.social_insurance_payable);
  const consumptionBal = balanceOf(accounts.consumption_tax_payable);

  try {
    const portfolio = buildTaxCalendarPortfolio({ today: asOf });
    for (const row of portfolio.rows) {
      if (row.deadline >= asOf) continue;
      const obligation = remittanceObligationFromCashflowCategory(
        row.cashflow_category,
      );
      if (!obligation) continue;
      const bal =
        obligation === "withholding"
          ? withholdingBal
          : obligation === "social_insurance"
            ? socialBal
            : obligation === "consumption_tax"
              ? consumptionBal
              : 0;
      if (bal > 0) {
        issues.push({
          level: "error",
          message: `unremitted ${obligation}: balance ${bal} past deadline ${row.deadline} (${row.tax})`,
        });
      }
    }
  } catch {
    if (withholdingBal > 0 || socialBal > 0) {
      issues.push({
        level: "warning",
        message: `statutory payable balances remain (withholding=${withholdingBal}, social=${socialBal}) — calendar unavailable`,
      });
    }
  }

  return issues;
}
