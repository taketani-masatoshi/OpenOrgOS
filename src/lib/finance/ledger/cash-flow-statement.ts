import type { ChartOfAccounts } from "../../../../schemas/finance/types.js";
import { loadChartOfAccounts } from "../../data.js";
import { buildGlProfitLossSummary } from "../gl-report-basis.js";
import { buildTrialBalance } from "./trial-balance.js";
import {
  fiscalYearStartDate,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "../fiscal-year.js";

export type CashFlowLine = {
  label: string;
  amount_yen: number;
};

export type CashFlowStatement = {
  as_of: string;
  fiscal_year: string;
  method: "indirect";
  operating: CashFlowLine[];
  investing: CashFlowLine[];
  financing: CashFlowLine[];
  net_cash_change_yen: number;
  cash_begin_yen: number;
  cash_end_yen: number;
  reconciled: boolean;
  issues: string[];
};

const CASH_ROLE = "cash";

function balanceAt(
  asOf: string,
  accountCode: string,
  coa: ChartOfAccounts,
): number {
  const trial = buildTrialBalance({ asOf, coa });
  const row = trial.rows.find((entry) => entry.account_code === accountCode);
  return row?.balance_yen ?? 0;
}

function codesForRole(coa: ChartOfAccounts, role: string): string[] {
  return coa.accounts.filter((account) => account.cf_role === role).map((account) => account.code);
}

function sumRoleBalances(asOf: string, role: string, coa: ChartOfAccounts): number {
  return codesForRole(coa, role).reduce(
    (sum, code) => sum + balanceAt(asOf, code, coa),
    0,
  );
}

export function buildCashFlowStatement(input?: {
  asOf?: string;
  fiscalYear?: string;
  coa?: ChartOfAccounts;
}): CashFlowStatement {
  const coa = input?.coa ?? loadChartOfAccounts();
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear =
    input?.fiscalYear ??
    resolveFiscalYear(endMonth, asOf.slice(0, 7));
  const periodStart = fiscalYearStartDate(fiscalYear, endMonth);
  const issues: string[] = [];

  const pl = buildGlProfitLossSummary({ fiscalYear, asOf, coa });
  const netIncome = pl.net_profit;

  const depreciationAccounts = coa.accounts.filter(
    (account) =>
      account.type === "expense" &&
      (account.name.includes("減価償却") || account.code === "5600"),
  );
  const depAtEnd = depreciationAccounts.reduce(
    (sum, account) => sum + balanceAt(asOf, account.code, coa),
    0,
  );
  const depAtStart = depreciationAccounts.reduce(
    (sum, account) => sum + balanceAt(periodStart, account.code, coa),
    0,
  );
  const depreciationAddback = Math.max(0, depAtEnd - depAtStart);

  const cashCodes = codesForRole(coa, CASH_ROLE);
  if (cashCodes.length === 0) issues.push("cash role missing");

  const wcAssetsStart = sumRoleBalances(periodStart, "receivable", coa);
  const wcAssetsEnd = sumRoleBalances(asOf, "receivable", coa);
  const wcLiabStart = sumRoleBalances(periodStart, "payable", coa);
  const wcLiabEnd = sumRoleBalances(asOf, "payable", coa);
  const workingCapitalChange = wcAssetsStart - wcAssetsEnd + (wcLiabEnd - wcLiabStart);

  const fixedStart = sumRoleBalances(periodStart, "fixed_asset", coa);
  const fixedEnd = sumRoleBalances(asOf, "fixed_asset", coa);
  const investingCash = -(fixedEnd - fixedStart);

  const equityStart = sumRoleBalances(periodStart, "equity", coa);
  const equityEnd = sumRoleBalances(asOf, "equity", coa);
  const loanStart = sumRoleBalances(periodStart, "loan", coa);
  const loanEnd = sumRoleBalances(asOf, "loan", coa);
  const financingCash = equityEnd - equityStart + (loanEnd - loanStart) - netIncome;

  const startTrial = buildTrialBalance({ asOf: periodStart, coa });
  const endTrial = buildTrialBalance({ asOf, coa });
  for (const row of endTrial.rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (!account) continue;
    if (account.type === "revenue" || account.type === "expense") continue;
    if (account.cf_role) continue;
    const start = startTrial.rows.find((item) => item.account_code === row.account_code)?.balance_yen ?? 0;
    if (row.balance_yen !== start) {
      issues.push(`${row.account_code} missing cf_role`);
    }
  }

  const operating: CashFlowLine[] = [
    { label: "当期純利益", amount_yen: netIncome },
    { label: "減価償却費（加算）", amount_yen: depreciationAddback },
    { label: "運転資本の増減", amount_yen: workingCapitalChange },
  ];
  const investing: CashFlowLine[] = [
    { label: "固定資産の取得・売却", amount_yen: investingCash },
  ];
  const financing: CashFlowLine[] = [
    { label: "財務活動によるキャッシュ・フロー", amount_yen: financingCash },
  ];

  const netCashChange =
    operating.reduce((s, row) => s + row.amount_yen, 0) +
    investing.reduce((s, row) => s + row.amount_yen, 0) +
    financing.reduce((s, row) => s + row.amount_yen, 0);

  const cashBegin = cashCodes.reduce((sum, code) => sum + balanceAt(periodStart, code, coa), 0);
  const cashEnd = cashCodes.reduce((sum, code) => sum + balanceAt(asOf, code, coa), 0);
  const reconciled = cashBegin + netCashChange === cashEnd;

  if (!reconciled) {
    issues.push(
      `cash reconciliation: begin ${cashBegin} + net ${netCashChange} != end ${cashEnd}`,
    );
  }

  return {
    as_of: asOf,
    fiscal_year: fiscalYear,
    method: "indirect",
    operating,
    investing,
    financing,
    net_cash_change_yen: netCashChange,
    cash_begin_yen: cashBegin,
    cash_end_yen: cashEnd,
    reconciled,
    issues,
  };
}
