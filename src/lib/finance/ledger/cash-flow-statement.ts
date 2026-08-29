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

const CASH_CODE = "1100";
const WORKING_CAPITAL_ASSET_PREFIXES = ["1150", "1300"];
const FIXED_ASSET_PREFIXES = ["1200", "1210"];
const LIABILITY_PREFIXES = ["2100", "3100", "3200"];

function balanceAt(
  asOf: string,
  accountCode: string,
  coa: ChartOfAccounts,
): number {
  const trial = buildTrialBalance({ asOf, coa });
  const row = trial.rows.find((entry) => entry.account_code === accountCode);
  return row?.balance_yen ?? 0;
}

function sumPrefixBalances(
  asOf: string,
  prefixes: string[],
  coa: ChartOfAccounts,
): number {
  const trial = buildTrialBalance({ asOf, coa });
  return trial.rows
    .filter((row) => prefixes.some((prefix) => row.account_code.startsWith(prefix)))
    .reduce((sum, row) => sum + row.balance_yen, 0);
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

  const wcAssetsStart = sumPrefixBalances(periodStart, WORKING_CAPITAL_ASSET_PREFIXES, coa);
  const wcAssetsEnd = sumPrefixBalances(asOf, WORKING_CAPITAL_ASSET_PREFIXES, coa);
  const wcLiabStart = sumPrefixBalances(periodStart, ["3100"], coa);
  const wcLiabEnd = sumPrefixBalances(asOf, ["3100"], coa);
  const workingCapitalChange =
    (wcAssetsStart - wcAssetsEnd) + (wcLiabEnd - wcLiabStart);

  const fixedStart = sumPrefixBalances(periodStart, FIXED_ASSET_PREFIXES, coa);
  const fixedEnd = sumPrefixBalances(asOf, FIXED_ASSET_PREFIXES, coa);
  const investingCash = -(fixedEnd - fixedStart);

  const equityStart = sumPrefixBalances(periodStart, ["3200"], coa);
  const equityEnd = sumPrefixBalances(asOf, ["3200"], coa);
  const loanStart = sumPrefixBalances(periodStart, ["2100"], coa);
  const loanEnd = sumPrefixBalances(asOf, ["2100"], coa);
  const financingCash = (equityEnd - equityStart) + (loanEnd - loanStart) - netIncome;

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

  const cashBegin = balanceAt(periodStart, CASH_CODE, coa);
  const cashEnd = balanceAt(asOf, CASH_CODE, coa);
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
