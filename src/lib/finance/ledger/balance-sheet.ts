import type { ChartOfAccounts } from "../../../../schemas/finance/types.js";
import { buildTrialBalance, type TrialBalanceRow } from "./trial-balance.js";
import { buildGlProfitLossSummary } from "../gl-report-basis.js";
import {
  fiscalYearStartDate,
  resolveFiscalYear,
  resolveCompanyFiscalYearEndMonth,
} from "../fiscal-year.js";
import { loadChartOfAccounts } from "../../data.js";
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
  account: { code: string; type: string },
): "current" | "noncurrent" | "equity" {
  if (account.type === "equity") return "equity";
  const n = Number.parseInt(account.code, 10);
  if (account.type === "asset" || account.type === "asset_contra") {
    return n < 1200 ? "current" : "noncurrent";
  }
  if (account.code === "2100") return "noncurrent";
  return "current";
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

export function buildGlEquityChangeRows(input?: {
  asOf?: string;
  fiscalYear?: string;
}): PdfTableRow[] {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear =
    input?.fiscalYear ?? resolveFiscalYear(endMonth, asOf.slice(0, 7));
  const openingAsOf = (() => {
    const start = fiscalYearStartDate(fiscalYear, endMonth);
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const opening = buildBalanceSheet({ asOf: openingAsOf, fiscalYear });
  const closing = buildBalanceSheet({ asOf, fiscalYear });
  const openingEquity = opening.total_equity_yen + opening.net_income_yen;
  return [
    { label: "期首純資産", amount: openingEquity, variant: "muted" },
    { label: "当期純利益", amount: closing.net_income_yen, indent: 1, variant: "emphasis" },
    {
      label: "期末純資産",
      amount: closing.total_equity_yen + closing.net_income_yen,
      variant: "total",
    },
  ];
}
