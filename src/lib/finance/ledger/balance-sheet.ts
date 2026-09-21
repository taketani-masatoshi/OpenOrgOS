import type { ChartOfAccounts } from "../../../../schemas/finance/types.js";
import { buildTrialBalance, type TrialBalanceRow } from "./trial-balance.js";
import { buildGlProfitLossSummary } from "../gl-report-basis.js";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  resolveFiscalYear,
  resolveCompanyFiscalYearEndMonth,
} from "../fiscal-year.js";
import { loadChartOfAccounts, loadFixedAssets } from "../../data.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import { loadOpeningBalances } from "./opening-balance.js";
import { readYearEndDeclaration } from "../year-end-file.js";
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

export type EquityClassName = "capital" | "capital_surplus" | "retained";

export type EquityComponentChange = {
  equity_class: EquityClassName;
  opening_yen: number;
  net_income_yen: number;
  dividend_yen: number;
  capital_yen: number;
  closing_yen: number;
  balanced: boolean;
};

export type EquityChange = {
  opening_yen: number;
  net_income_yen: number;
  dividend_yen: number;
  capital_yen: number;
  closing_yen: number;
  balanced: boolean;
  components: EquityComponentChange[];
  issues: string[];
};

function equityClassOf(
  account: { code: string; type: string; equity_class?: EquityClassName },
  retainedCode: string | null,
): EquityClassName | "unclassified" {
  if (account.type !== "equity") return "unclassified";
  if (account.equity_class) return account.equity_class;
  if (retainedCode && account.code === retainedCode) return "retained";
  return "unclassified";
}

export function equityChangeAmounts(input?: {
  asOf?: string;
  fiscalYear?: string;
}): EquityChange {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear =
    input?.fiscalYear ?? resolveFiscalYear(endMonth, asOf.slice(0, 7));
  const start = fiscalYearStartDate(fiscalYear, endMonth);
  const end = fiscalYearEndDate(fiscalYear, endMonth);
  const dayBeforeStart = (() => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  })();
  const openingFile = loadOpeningBalances();
  const openingAsOf =
    openingFile &&
    openingFile.as_of >= start &&
    openingFile.as_of <= asOf
      ? openingFile.as_of
      : dayBeforeStart;
  const opening = buildBalanceSheet({ asOf: openingAsOf });
  const closing = buildBalanceSheet({ asOf, fiscalYear });
  const coa = loadChartOfAccounts();
  let retainedCode: string | null = null;
  try {
    retainedCode = coa.journal_source_accounts?.retained_earnings ?? null;
  } catch {
    retainedCode = null;
  }
  const issues: string[] = [];
  const classes: EquityClassName[] = ["capital", "capital_surplus", "retained"];
  const buckets = new Map<
    EquityClassName,
    { opening: number; closing: number; dividend: number; capital: number }
  >(
    classes.map((name) => [name, { opening: 0, closing: 0, dividend: 0, capital: 0 }]),
  );

  const addBalance = (
    lines: Array<{ account_code: string; balance_yen: number }>,
    field: "opening" | "closing",
  ) => {
    for (const line of lines) {
      const account = coa.accounts.find((item) => item.code === line.account_code);
      if (!account || account.type !== "equity" || line.balance_yen === 0) continue;
      const cls = equityClassOf(account, retainedCode);
      if (cls === "unclassified") {
        issues.push(`missing equity_class ${line.account_code}`);
        continue;
      }
      buckets.get(cls)![field] += line.balance_yen;
    }
  };
  addBalance(opening.equity, "opening");
  addBalance(closing.equity, "closing");

  for (const entry of loadJournalEntries().entries) {
    const date = entry.occurred_at.slice(0, 10);
    if (date < start || date > end) continue;
    if (entry.source?.kind !== "dividend" && entry.source?.kind !== "capital") continue;
    for (const line of entry.lines) {
      const account = coa.accounts.find((item) => item.code === line.account_code);
      if (!account || account.type !== "equity") continue;
      const cls = equityClassOf(account, retainedCode);
      if (cls === "unclassified") {
        issues.push(`missing equity_class ${line.account_code}`);
        continue;
      }
      const bucket = buckets.get(cls)!;
      if (entry.source.kind === "dividend") {
        bucket.dividend += line.debit_yen - line.credit_yen;
      } else {
        bucket.capital += line.credit_yen - line.debit_yen;
      }
    }
  }

  let transferredToRetained = 0;
  for (const entry of loadJournalEntries().entries) {
    const date = entry.occurred_at.slice(0, 10);
    if (date < start || date > end) continue;
    if (entry.source?.kind !== "closing" || entry.source.adjustment_id !== "pl-transfer") continue;
    for (const line of entry.lines) {
      const account = coa.accounts.find((item) => item.code === line.account_code);
      if (!account || equityClassOf(account, retainedCode) !== "retained") continue;
      transferredToRetained += line.credit_yen - line.debit_yen;
    }
  }

  const components: EquityComponentChange[] = classes.map((name) => {
    const bucket = buckets.get(name)!;
    const openingNi = name === "retained" ? opening.net_income_yen : 0;
    const closingNi = name === "retained" ? closing.net_income_yen : 0;
    const transferred = name === "retained" ? transferredToRetained : 0;
    const net_income_yen = closingNi - openingNi + transferred;
    const opening_yen = bucket.opening + openingNi;
    const closing_yen = bucket.closing + closingNi;
    const balanced =
      closing_yen === opening_yen + net_income_yen - bucket.dividend + bucket.capital;
    if (!balanced) issues.push(`equity rollforward ${name}`);
    return {
      equity_class: name,
      opening_yen,
      net_income_yen,
      dividend_yen: bucket.dividend,
      capital_yen: bucket.capital,
      closing_yen,
      balanced,
    };
  });

  const opening_yen = components.reduce((sum, row) => sum + row.opening_yen, 0);
  const dividend_yen = components.reduce((sum, row) => sum + row.dividend_yen, 0);
  const capital_yen = components.reduce((sum, row) => sum + row.capital_yen, 0);
  const closing_yen = components.reduce((sum, row) => sum + row.closing_yen, 0);
  const uniqueIssues = [...new Set(issues)];
  return {
    opening_yen,
    net_income_yen: components.reduce((sum, row) => sum + row.net_income_yen, 0),
    dividend_yen,
    capital_yen,
    closing_yen,
    balanced: uniqueIssues.length === 0 && components.every((row) => row.balanced),
    components,
    issues: uniqueIssues,
  };
}

const EQUITY_LABEL: Record<EquityClassName, string> = {
  capital: "資本金",
  capital_surplus: "資本剰余金",
  retained: "利益剰余金",
};

export function buildIndividualNotes(input?: {
  asOf?: string;
  fiscalYear?: string;
}): string[] {
  return buildIndividualNotesReport(input).lines;
}

export function buildIndividualNotesReport(input?: {
  asOf?: string;
  fiscalYear?: string;
}): { lines: string[]; ready: boolean; errors: string[] } {
  const asOf = input?.asOf ?? new Date().toISOString().slice(0, 10);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear =
    input?.fiscalYear ?? resolveFiscalYear(endMonth, asOf.slice(0, 7));
  const change = equityChangeAmounts({ asOf, fiscalYear });
  let assets: Array<{ depreciation_method?: string }> = [];
  try {
    assets = loadFixedAssets().assets;
  } catch {
    assets = [];
  }
  const methods = [
    ...new Set(
      assets
        .map((asset) => asset.depreciation_method)
        .filter((method): method is string => Boolean(method)),
    ),
  ];
  const policy =
    assets.length === 0
      ? "会計方針: 固定資産はない。収益および費用は発生主義で認識する。"
      : methods.length === 1
        ? `会計方針: 減価償却は${methods[0]}により計上する。収益および費用は発生主義で認識する。`
        : `会計方針: 減価償却は方法が混在する（${methods.join("・")}）。収益および費用は発生主義で認識する。`;
  const movement =
    change.dividend_yen === 0 && change.capital_yen === 0
      ? "配当・資本取引: 該当なし"
      : `配当 ${change.dividend_yen} 円、資本取引 ${change.capital_yen} 円`;
  const declaration = readYearEndDeclaration(fiscalYear);
  const errors: string[] = [];
  let subsequent = "後発事象: 宣言がない";
  if (!declaration.ok) {
    errors.push("subsequent events missing");
  } else if (declaration.value.subsequent_events.status === "none") {
    subsequent = "後発事象: 該当なし";
  } else {
    subsequent = `後発事象: ${declaration.value.subsequent_events.text}`;
  }
  return {
    lines: [policy, movement, subsequent],
    ready: errors.length === 0,
    errors,
  };
}

export function buildGlEquityChangeRows(input?: {
  asOf?: string;
  fiscalYear?: string;
}): PdfTableRow[] {
  const change = equityChangeAmounts(input);
  const rows: PdfTableRow[] = [
    { label: "期首純資産", amount: change.opening_yen, variant: "muted" },
    { label: "当期純利益", amount: change.net_income_yen, indent: 1, variant: "emphasis" },
    { label: "配当", amount: change.dividend_yen, indent: 1 },
    { label: "資本取引", amount: change.capital_yen, indent: 1 },
    { label: "期末純資産", amount: change.closing_yen, variant: "total" },
  ];
  for (const component of change.components) {
    rows.push({
      label: EQUITY_LABEL[component.equity_class],
      amount: "",
      variant: "section",
    });
    rows.push({ label: "期首", amount: component.opening_yen, indent: 1, variant: "muted" });
    if (component.net_income_yen !== 0) {
      rows.push({
        label: "当期純利益",
        amount: component.net_income_yen,
        indent: 1,
        variant: "emphasis",
      });
    }
    if (component.dividend_yen !== 0) {
      rows.push({ label: "配当", amount: component.dividend_yen, indent: 1 });
    }
    if (component.capital_yen !== 0) {
      rows.push({ label: "資本取引", amount: component.capital_yen, indent: 1 });
    }
    rows.push({ label: "期末", amount: component.closing_yen, indent: 1, variant: "total" });
  }
  return rows;
}
