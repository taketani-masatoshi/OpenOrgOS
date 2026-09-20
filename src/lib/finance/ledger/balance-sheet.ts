import type { ChartOfAccounts } from "../../../../schemas/finance/types.js";
import { buildTrialBalance, type TrialBalanceRow } from "./trial-balance.js";
import { buildGlProfitLossSummary } from "../gl-report-basis.js";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  resolveFiscalYear,
  resolveCompanyFiscalYearEndMonth,
} from "../fiscal-year.js";
import { loadChartOfAccounts } from "../../data.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import type { PdfTableRow } from "../../pdf.js";

export type BalanceSheetLine = {
  account_code: string;
  account_name: string;
  section: "asset" | "liability" | "equity";
  balance_yen: number;
};

export type BalanceSheetReport = {
  as_of: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  total_assets_yen: number;
  total_liabilities_yen: number;
  total_equity_yen: number;
  balanced: boolean;
  net_income_yen: number;
  issues: string[];
};

function classifyRow(row: TrialBalanceRow, coa: ChartOfAccounts): BalanceSheetLine | null {
  const account = coa.accounts.find((a) => a.code === row.account_code);
  if (!account) return null;
  if (account.type === "revenue" || account.type === "expense") return null;
  const section =
    account.type === "asset" || account.type === "asset_contra"
      ? "asset"
      : account.type === "liability"
        ? "liability"
        : account.type === "equity"
          ? "equity"
          : null;
  if (!section) return null;
  const balance =
    account.type === "asset_contra" ? -Math.abs(row.balance_yen) : row.balance_yen;
  return {
    account_code: row.account_code,
    account_name: row.account_name,
    section,
    balance_yen: balance,
  };
}

export function buildBalanceSheet(input?: {
  asOf?: string;
  fiscalYear?: string;
  coa?: ChartOfAccounts;
}): BalanceSheetReport {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const coa = input?.coa ?? loadChartOfAccounts();
  const trial = buildTrialBalance({ asOf, coa });
  const issues: string[] = [...trial.issues];

  const assets: BalanceSheetLine[] = [];
  const liabilities: BalanceSheetLine[] = [];
  const equity: BalanceSheetLine[] = [];

  for (const row of trial.rows) {
    const line = classifyRow(row, coa);
    if (!line) continue;
    if (line.section === "asset") assets.push(line);
    if (line.section === "liability") liabilities.push(line);
    if (line.section === "equity") equity.push(line);
    if (
      (line.section === "asset" || line.section === "liability") &&
      line.balance_yen !== 0
    ) {
      const account = coa.accounts.find((item) => item.code === line.account_code);
      if (account && inferBsClass(account) === "unclassified") {
        issues.push(`${line.account_code} missing bs_class`);
      }
    }
  }

  const total_assets_yen = assets.reduce((s, l) => s + l.balance_yen, 0);
  const total_liabilities_yen = liabilities.reduce((s, l) => s + l.balance_yen, 0);
  const total_equity_yen = equity.reduce((s, l) => s + l.balance_yen, 0);
  const fiscalYear =
    input?.fiscalYear ??
    resolveFiscalYear(resolveCompanyFiscalYearEndMonth(), asOf.slice(0, 7));
  const net_income_yen = buildGlProfitLossSummary({ fiscalYear, asOf }).net_profit;

  const balanced =
    total_assets_yen === total_liabilities_yen + total_equity_yen + net_income_yen;
  if (!balanced) {
    issues.push(
      `Balance sheet equation mismatch: assets=${total_assets_yen} liabilities+equity+income=${total_liabilities_yen + total_equity_yen + net_income_yen}`,
    );
  }

  return {
    as_of: asOf,
    assets,
    liabilities,
    equity,
    total_assets_yen,
    total_liabilities_yen,
    total_equity_yen,
    balanced,
    net_income_yen,
    issues,
  };
}

export function balanceSheetIntegrityIssues(input?: {
  asOf?: string;
  fiscalYear?: string;
}): string[] {
  return buildBalanceSheet(input).issues;
}

export function inferBsClass(
  account: { code: string; type: string; bs_class?: "current" | "noncurrent" },
): "current" | "noncurrent" | "equity" | "unclassified" {
  if (account.type === "equity") return "equity";
  if (account.bs_class === "current" || account.bs_class === "noncurrent") {
    return account.bs_class;
  }
  return "unclassified";
}

export function buildGlKessanBsRows(input?: {
  asOf?: string;
  fiscalYear?: string;
  priorAsOf?: string;
}): PdfTableRow[] {
  const report = buildBalanceSheet(input);
  const prior =
    input?.priorAsOf != null
      ? buildBalanceSheet({ asOf: input.priorAsOf })
      : null;
  const priorByCode = new Map(
    prior
      ? [...prior.assets, ...prior.liabilities, ...prior.equity].map((line) => [
          line.account_code,
          line.balance_yen,
        ])
      : [],
  );
  const coa = loadChartOfAccounts();
  const rows: PdfTableRow[] = [{ label: "資産の部", amount: "", variant: "section" }];
  if (prior) {
    rows.push({
      label: "（当期 / 前期）",
      amount: input?.asOf ?? "",
      priorAmount: input?.priorAsOf,
      variant: "muted",
    });
  }

  const pushClass = (
    section: BalanceSheetLine["section"],
    cls: "current" | "noncurrent",
    title: string,
  ) => {
    const lines = report[section === "asset" ? "assets" : section === "liability" ? "liabilities" : "equity"].filter(
      (line) => {
        const account = coa.accounts.find((a) => a.code === line.account_code);
        return account ? inferBsClass(account) === cls : false;
      },
    );
    if (lines.length === 0) return;
    rows.push({ label: title, amount: "", variant: "section" });
    for (const line of lines) {
      rows.push({
        label: line.account_name,
        amount: line.balance_yen,
        ...(prior
          ? { priorAmount: priorByCode.get(line.account_code) ?? 0 }
          : {}),
        indent: 1,
        variant: "muted",
      });
    }
  };

  pushClass("asset", "current", "流動資産");
  pushClass("asset", "noncurrent", "固定資産");
  rows.push({
    label: "資産合計",
    amount: report.total_assets_yen,
    ...(prior ? { priorAmount: prior.total_assets_yen } : {}),
    variant: "total",
  });
  rows.push({ label: "負債の部", amount: "", variant: "section" });
  pushClass("liability", "current", "流動負債");
  pushClass("liability", "noncurrent", "固定負債");
  rows.push({
    label: "負債合計",
    amount: report.total_liabilities_yen,
    ...(prior ? { priorAmount: prior.total_liabilities_yen } : {}),
    variant: "total",
  });
  rows.push({ label: "純資産の部", amount: "", variant: "section" });
  for (const line of report.equity) {
    rows.push({
      label: line.account_name,
      amount: line.balance_yen,
      ...(prior
        ? { priorAmount: priorByCode.get(line.account_code) ?? 0 }
        : {}),
      indent: 1,
      variant: "muted",
    });
  }
  rows.push({
    label: "当期純利益",
    amount: report.net_income_yen,
    ...(prior ? { priorAmount: prior.net_income_yen } : {}),
    indent: 1,
    variant: "emphasis",
  });
  rows.push({
    label: "純資産合計",
    amount: report.total_equity_yen + report.net_income_yen,
    ...(prior
      ? { priorAmount: prior.total_equity_yen + prior.net_income_yen }
      : {}),
    variant: "total",
  });
  rows.push({
    label: "負債・純資産合計",
    amount: report.total_liabilities_yen + report.total_equity_yen + report.net_income_yen,
    ...(prior
      ? {
          priorAmount:
            prior.total_liabilities_yen +
            prior.total_equity_yen +
            prior.net_income_yen,
        }
      : {}),
    variant: "emphasis",
  });
  return rows;
}

export function equityChangeAmounts(input?: {
  asOf?: string;
  fiscalYear?: string;
}): {
  opening_yen: number;
  net_income_yen: number;
  dividend_yen: number;
  capital_yen: number;
  closing_yen: number;
  balanced: boolean;
} {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear =
    input?.fiscalYear ?? resolveFiscalYear(endMonth, asOf.slice(0, 7));
  const openingAsOf = (() => {
    const start = fiscalYearStartDate(fiscalYear, endMonth);
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  })();
  const opening = buildBalanceSheet({ asOf: openingAsOf, fiscalYear });
  const closing = buildBalanceSheet({ asOf, fiscalYear });
  const opening_yen = opening.total_equity_yen + opening.net_income_yen;
  const closing_yen = closing.total_equity_yen + closing.net_income_yen;
  const start = fiscalYearStartDate(fiscalYear, endMonth);
  const end = fiscalYearEndDate(fiscalYear, endMonth);
  let dividend_yen = 0;
  let capital_yen = 0;
  for (const entry of loadJournalEntries().entries) {
    const date = entry.occurred_at.slice(0, 10);
    if (date < start || date > end) continue;
    const amount = entry.lines.reduce((sum, line) => sum + line.debit_yen, 0);
    if (entry.source?.kind === "dividend") dividend_yen += amount;
    if (entry.source?.kind === "capital") capital_yen += amount;
  }
  const balanced = closing_yen === opening_yen + closing.net_income_yen - dividend_yen + capital_yen;
  return {
    opening_yen,
    net_income_yen: closing.net_income_yen,
    dividend_yen,
    capital_yen,
    closing_yen,
    balanced,
  };
}

export function buildIndividualNotes(input?: {
  asOf?: string;
  fiscalYear?: string;
}): string[] {
  const change = equityChangeAmounts(input);
  const movement =
    change.dividend_yen === 0 && change.capital_yen === 0
      ? "配当・資本取引: 該当なし"
      : `配当 ${change.dividend_yen} 円、資本取引 ${change.capital_yen} 円`;
  return [
    "会計方針: 減価償却は定額法により計上する。収益および費用は発生主義で認識する。",
    movement,
  ];
}

export function buildGlEquityChangeRows(input?: {
  asOf?: string;
  fiscalYear?: string;
}): PdfTableRow[] {
  const change = equityChangeAmounts(input);
  return [
    { label: "期首純資産", amount: change.opening_yen, variant: "muted" },
    { label: "当期純利益", amount: change.net_income_yen, indent: 1, variant: "emphasis" },
    { label: "配当", amount: change.dividend_yen, indent: 1 },
    { label: "資本取引", amount: change.capital_yen, indent: 1 },
    { label: "期末純資産", amount: change.closing_yen, variant: "total" },
  ];
}
