/**
 * Companies Act statement lines and the ledger field that fills each one.
 * Cash flow is not a required line for a small-company statutory set.
 */
import type { ChartOfAccounts } from "../../../../schemas/finance/types.js";
import type { StatementSection } from "../../../../schemas/finance/chart-of-accounts.js";
import { loadChartOfAccounts } from "../../data.js";
import { buildGlProfitLossSummary } from "../gl-report-basis.js";
import {
  fiscalYearEndDate,
  resolveCompanyFiscalYearEndMonth,
} from "../fiscal-year.js";
import {
  buildBalanceSheet,
  buildIndividualNotes,
  equityChangeAmounts,
  inferBsClass,
} from "./balance-sheet.js";
import { buildTrialBalance } from "./trial-balance.js";
import { buildStatutoryStatements } from "./statutory-statements.js";
import {
  buildAccountingPolicyParagraph,
  buildSubsequentEventsParagraph,
  buildSurplusDisposalParagraph,
} from "./financial-statement-disclosures.js";
import type { PdfTableRow } from "../../pdf.js";

export const COMPANIES_ACT_LINE_MAP = [
  { id: "current_assets", label: "流動資産", source: "bs_class" },
  { id: "noncurrent_assets", label: "固定資産", source: "bs_class" },
  { id: "deferred_assets", label: "繰延資産", source: "bs_class" },
  { id: "current_liabilities", label: "流動負債", source: "bs_class" },
  { id: "noncurrent_liabilities", label: "固定負債", source: "bs_class" },
  { id: "capital", label: "資本金", source: "equity_class" },
  { id: "capital_surplus", label: "資本剰余金", source: "equity_class" },
  { id: "retained", label: "利益剰余金", source: "equity_class" },
  { id: "treasury_stock", label: "自己株式", source: "equity_class" },
  { id: "revenue", label: "売上高", source: "statement_section" },
  { id: "cogs", label: "売上原価", source: "statement_section" },
  { id: "sga", label: "販売費及び一般管理費", source: "statement_section" },
  { id: "non_operating_income", label: "営業外収益", source: "statement_section" },
  { id: "non_operating_expense", label: "営業外費用", source: "statement_section" },
  { id: "extraordinary_gain", label: "特別利益", source: "statement_section" },
  { id: "extraordinary_loss", label: "特別損失", source: "statement_section" },
  { id: "income_tax", label: "法人税等", source: "statement_section" },
  { id: "surplus_dividend", label: "剰余金の配当", source: "surplus_disposal" },
  { id: "accounting_policy", label: "会計方針", source: "disclosures" },
  { id: "subsequent_events", label: "後発事象", source: "disclosures" },
] as const;

export type CompaniesActLineId = (typeof COMPANIES_ACT_LINE_MAP)[number]["id"];

export type CompaniesActStatementRow = {
  id: CompaniesActLineId;
  label: string;
  source: string;
  amount_yen: number | null;
  text: string | null;
};

export type CompaniesActStatementPack = {
  fiscal_year: string;
  as_of: string;
  rows: CompaniesActStatementRow[];
  complete: boolean;
  errors: string[];
  note_lines: string[];
  surplus_text: string;
  bs_rows: PdfTableRow[];
  pl_rows: PdfTableRow[];
  equity_rows: PdfTableRow[];
};

const PL_SECTION: Partial<Record<CompaniesActLineId, StatementSection>> = {
  revenue: "revenue",
  cogs: "cogs",
  sga: "sga",
  non_operating_income: "non_operating_income",
  non_operating_expense: "non_operating_expense",
  extraordinary_gain: "extraordinary_gain",
  extraordinary_loss: "extraordinary",
  income_tax: "income_tax",
};

export function buildCompaniesActStatementPack(fiscalYear: string): CompaniesActStatementPack {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, endMonth);
  const coa = loadChartOfAccounts();
  const notes = buildIndividualNotes({ asOf, fiscalYear });
  const policy = buildAccountingPolicyParagraph({ asOf, fiscalYear });
  const subsequent = buildSubsequentEventsParagraph(fiscalYear);
  const surplus = buildSurplusDisposalParagraph(fiscalYear);
  const equity = equityChangeAmounts({ asOf, fiscalYear });
  const pl = buildGlProfitLossSummary({ fiscalYear, asOf, coa });
  const amounts = statementAmounts(asOf, coa, pl.rows);

  const rows = COMPANIES_ACT_LINE_MAP.map((line) =>
    fillLine(line, amounts, equity.dividend_yen, policy, subsequent.line, surplus),
  );
  const errors = [
    ...surplus.errors,
    ...subsequent.errors,
    ...unclassifiedBalanceIssues(asOf, coa),
  ];
  const statutory = buildStatutoryStatements(fiscalYear);
  return {
    fiscal_year: fiscalYear,
    as_of: asOf,
    rows,
    complete: errors.length === 0,
    errors,
    note_lines: notes,
    surplus_text: surplus.text,
    bs_rows: statutory.bsRows,
    pl_rows: statutory.plRows,
    equity_rows: statutory.equityRows,
  };
}

function fillLine(
  line: (typeof COMPANIES_ACT_LINE_MAP)[number],
  amounts: Map<CompaniesActLineId, number>,
  dividendYen: number,
  policy: string,
  subsequentLine: string,
  surplus: { text: string; errors: string[] },
): CompaniesActStatementRow {
  if (line.id === "accounting_policy") {
    return { ...line, amount_yen: null, text: policy };
  }
  if (line.id === "subsequent_events") {
    return { ...line, amount_yen: null, text: subsequentLine };
  }
  if (line.id === "surplus_dividend") {
    const declaredNone = surplus.text.includes("該当なし");
    return {
      ...line,
      amount_yen: surplus.errors.length === 0 ? (declaredNone ? 0 : dividendYen) : null,
      text: surplus.text || null,
    };
  }
  const amount = amounts.get(line.id) ?? 0;
  return { ...line, amount_yen: amount, text: null };
}

function statementAmounts(
  asOf: string,
  coa: ChartOfAccounts,
  plRows: Array<{ statement_section?: StatementSection; amount: number }>,
): Map<CompaniesActLineId, number> {
  const amounts = new Map<CompaniesActLineId, number>();
  amounts.set("current_assets", sumBsClass(asOf, coa, "asset", "current"));
  amounts.set("noncurrent_assets", sumBsClass(asOf, coa, "asset", "noncurrent"));
  amounts.set("deferred_assets", 0);
  amounts.set("current_liabilities", sumBsClass(asOf, coa, "liability", "current"));
  amounts.set("noncurrent_liabilities", sumBsClass(asOf, coa, "liability", "noncurrent"));
  amounts.set("capital", sumEquityClass(asOf, coa, "capital"));
  amounts.set("capital_surplus", sumEquityClass(asOf, coa, "capital_surplus"));
  amounts.set("retained", sumEquityClass(asOf, coa, "retained"));
  amounts.set("treasury_stock", 0);
  for (const [id, section] of Object.entries(PL_SECTION) as Array<
    [CompaniesActLineId, StatementSection]
  >) {
    const total = plRows
      .filter((row) => row.statement_section === section)
      .reduce((sum, row) => sum + row.amount, 0);
    amounts.set(id, total);
  }
  return amounts;
}

function sumBsClass(
  asOf: string,
  coa: ChartOfAccounts,
  section: "asset" | "liability",
  cls: "current" | "noncurrent",
): number {
  const trial = buildTrialBalance({ asOf, coa });
  let total = 0;
  for (const row of trial.rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (!account || accountSection(account) !== section) continue;
    if (inferBsClass(account) !== cls) continue;
    total += signedBalance(account, row.balance_yen);
  }
  return total;
}

function sumEquityClass(
  asOf: string,
  coa: ChartOfAccounts,
  equityClass: "capital" | "capital_surplus" | "retained",
): number {
  const retained = coa.journal_source_accounts?.retained_earnings;
  const trial = buildTrialBalance({ asOf, coa });
  let total = 0;
  for (const row of trial.rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (!account || account.type !== "equity") continue;
    const cls = account.equity_class ?? (account.code === retained ? "retained" : undefined);
    if (cls !== equityClass) continue;
    total += row.balance_yen;
  }
  return total;
}

function unclassifiedBalanceIssues(asOf: string, coa: ChartOfAccounts): string[] {
  return buildBalanceSheet({ asOf, coa }).issues.filter((issue) => issue.includes("missing bs_class"));
}

function accountSection(account: {
  type: string;
}): "asset" | "liability" | null {
  if (account.type === "asset" || account.type === "asset_contra") return "asset";
  if (account.type === "liability") return "liability";
  return null;
}

function signedBalance(account: { type: string }, balanceYen: number): number {
  return account.type === "asset_contra" ? -Math.abs(balanceYen) : balanceYen;
}
