/**
 * Statutory financial statements for a non-public company without an accounting auditor.
 * Company Calculation Regulations Article 98(2)(i) notes are separate from the annual close.
 */
import type { ChartOfAccounts } from "../../../../schemas/finance/types.js";
import type { StatementSection } from "../../../../schemas/finance/chart-of-accounts.js";
import { loadChartOfAccounts, loadFixedAssets } from "../../data.js";
import {
  fiscalYearEndDate,
  resolveCompanyFiscalYearEndMonth,
} from "../fiscal-year.js";
import { readYearEndDeclaration } from "../year-end-file.js";
import type { PdfTableRow } from "../../pdf.js";
import { equityChangeAmounts, inferBsClass } from "./balance-sheet.js";
import { noteWhenDeclared } from "./financial-statement-disclosures.js";
import { buildTrialBalance } from "./trial-balance.js";

export type StatutoryNote = {
  articleId: string;
  heading: string;
  body: string;
};

export type StatutoryStatements = {
  fiscalYear: string;
  amounts: Record<string, number>;
  texts: Record<string, string>;
  notes: StatutoryNote[];
  text: string;
  complete: boolean;
  errors: string[];
  bsRows: PdfTableRow[];
  plRows: PdfTableRow[];
  equityRows: PdfTableRow[];
  noteLines: string[];
  surplusText: string;
  /** Section headings in statement order. The 12-point pin is not stored here. */
  displayLabels: string[];
};

export const STATUTORY_NOTE_SPECS = [
  { articleId: "reg-100", heading: "継続企業の前提に関する注記" },
  { articleId: "reg-101", heading: "重要な会計方針に係る事項に関する注記" },
  { articleId: "reg-102-3", heading: "表示方法の変更に関する注記" },
  { articleId: "reg-107", heading: "税効果会計に関する注記" },
  { articleId: "reg-112", heading: "関連当事者との取引に関する注記" },
  { articleId: "reg-113", heading: "一株当たり情報に関する注記" },
  { articleId: "reg-114", heading: "重要な後発事象に関する注記" },
] as const;

export function legalReserveAdditionYen(input: {
  capitalYen: number | null;
  existingReserveYen: number;
  dividendYen: number;
}): { additionYen: number; incomplete: boolean; errors: string[] } {
  if (input.dividendYen <= 0) {
    return { additionYen: 0, incomplete: false, errors: [] };
  }
  if (input.capitalYen == null) {
    return {
      additionYen: 0,
      incomplete: true,
      errors: ["dividend without a capital account"],
    };
  }
  const quarter = Math.floor(input.capitalYen / 4);
  if (input.existingReserveYen >= quarter) {
    return { additionYen: 0, incomplete: false, errors: [] };
  }
  const room = quarter - input.existingReserveYen;
  const tenth = Math.floor(input.dividendYen / 10);
  return {
    additionYen: Math.min(room, tenth),
    incomplete: false,
    errors: [],
  };
}


/** Ordinance note headings in statement order (skeleton completeness). */
export function statutoryNoteHeadings(): string[] {
  return STATUTORY_NOTE_SPECS.map((spec) => spec.heading);
}

export function buildStatutoryStatements(fiscalYear: string): StatutoryStatements {
  const asOf = fiscalYearEndDate(fiscalYear, resolveCompanyFiscalYearEndMonth());
  const coa = loadChartOfAccounts();
  const trial = buildTrialBalance({ asOf, coa });
  const errors: string[] = [];
  const pl = plAmounts(coa, trial.rows);
  const classes = bsClassAmounts(coa, trial.rows);
  const equity = equityChangeAmounts({ asOf, fiscalYear });
  const component = (name: "capital" | "capital_surplus" | "retained") =>
    equity.components.find((row) => row.equity_class === name);

  const capital = component("capital");
  const capitalSurplus = component("capital_surplus");
  const retained = component("retained");
  const hasCapitalAccount = coa.accounts.some((account) => account.equity_class === "capital");
  const reserve = legalReserveAdditionYen({
    capitalYen: hasCapitalAccount ? (capital?.closing_yen ?? 0) : null,
    existingReserveYen: legalReserveBalance(coa, trial.rows),
    dividendYen: retained?.dividend_yen ?? 0,
  });
  errors.push(...reserve.errors);

  const amounts: Record<string, number> = {
    current_assets: classes.current_assets,
    noncurrent_assets: classes.noncurrent_assets,
    total_assets: classes.current_assets + classes.noncurrent_assets,
    current_liabilities: classes.current_liabilities,
    noncurrent_liabilities: classes.noncurrent_liabilities,
    total_liabilities: classes.current_liabilities + classes.noncurrent_liabilities,
    capital: capital?.closing_yen ?? 0,
    capital_surplus: capitalSurplus?.closing_yen ?? 0,
    retained_earnings: retained?.closing_yen ?? 0,
    unclassified_balance: classes.unclassified_balance,
    revenue: pl.revenue,
    cogs: pl.cogs,
    gross_profit: pl.revenue - pl.cogs,
    sga: pl.sga,
    operating_profit: pl.revenue - pl.cogs - pl.sga,
    non_operating_income: pl.non_operating_income,
    non_operating_expense: pl.non_operating_expense,
    extraordinary_gain: pl.extraordinary_gain,
    extraordinary_loss: pl.extraordinary_loss,
    income_tax: pl.income_tax,
    retained_opening: retained?.opening_yen ?? 0,
    retained_net_income: retained?.net_income_yen ?? 0,
    retained_dividend: retained?.dividend_yen ?? 0,
    retained_closing: retained?.closing_yen ?? 0,
    capital_contribution: capital?.capital_yen ?? 0,
    legal_reserve_addition: reserve.additionYen,
    surplus_carryforward: (retained?.closing_yen ?? 0) - reserve.additionYen,
  };
  amounts.ordinary_profit =
    amounts.operating_profit + amounts.non_operating_income - amounts.non_operating_expense;
  amounts.pretax_profit =
    amounts.ordinary_profit + amounts.extraordinary_gain - amounts.extraordinary_loss;
  amounts.net_profit = amounts.pretax_profit - amounts.income_tax;
  amounts.total_net_assets =
    amounts.capital + amounts.capital_surplus + amounts.retained_earnings;
  amounts.total_liabilities_and_net_assets =
    amounts.total_liabilities + amounts.total_net_assets;

  const texts: Record<string, string> = {};
  const notes = buildNotes(fiscalYear, errors);
  const noteLines = notes.map((note) => `[${note.articleId}] ${note.heading}\n${note.body}`);
  const surplusText = [
    `利益準備金 ${amounts.legal_reserve_addition}`,
    `繰越利益剰余金 ${amounts.surplus_carryforward}`,
  ].join("\n");

  const bsRows = amountRows([
    ["流動資産", amounts.current_assets],
    ["固定資産", amounts.noncurrent_assets],
    ["繰延資産", 0],
    ["流動負債", amounts.current_liabilities],
    ["固定負債", amounts.noncurrent_liabilities],
    ["資本金", amounts.capital],
    ["資本剰余金", amounts.capital_surplus],
    ["利益剰余金", amounts.retained_earnings],
    ["自己株式", 0],
    ["評価・換算差額等", 0],
    ["新株予約権", 0],
  ]);
  const plRows = amountRows([
    ["売上高", amounts.revenue],
    ["売上原価", amounts.cogs],
    ["売上総利益金額", amounts.gross_profit],
    ["販売費及び一般管理費", amounts.sga],
    ["営業利益金額", amounts.operating_profit],
    ["営業外収益", amounts.non_operating_income],
    ["営業外費用", amounts.non_operating_expense],
    ["経常利益金額", amounts.ordinary_profit],
    ["特別利益", amounts.extraordinary_gain],
    ["特別損失", amounts.extraordinary_loss],
    ["税引前当期純利益金額", amounts.pretax_profit],
    ["法人税等", amounts.income_tax],
    ["当期純利益金額", amounts.net_profit],
  ]);
  const equityRows = amountRows([
    ["当期首残高", amounts.retained_opening],
    ["剰余金の配当", amounts.retained_dividend],
    ["当期純利益金額", amounts.retained_net_income],
    ["当期末残高", amounts.retained_closing],
  ]);
  const displayLabels = [
    ...bsRows.map((row) => row.label),
    ...plRows.map((row) => row.label),
    ...equityRows.map((row) => row.label),
    ...notes.map((note) => note.heading),
  ];

  const text = [
    "貸借対照表",
    ...bsRows.map(textLine),
    "損益計算書",
    ...plRows.map(textLine),
    "株主資本等変動計算書",
    ...equityRows.map(textLine),
    "個別注記表",
    ...noteLines,
    "剰余金の処分",
    surplusText,
  ].join("\n");

  return {
    fiscalYear,
    amounts,
    texts,
    notes,
    text,
    complete: errors.length === 0,
    errors,
    bsRows,
    plRows,
    equityRows,
    noteLines,
    surplusText,
    displayLabels,
  };
}

function amountRows(lines: Array<[string, number]>): PdfTableRow[] {
  return lines.map(([label, amount]) => ({ label, amount }));
}

function textLine(row: PdfTableRow): string {
  return `${row.label} ${row.amount ?? ""}`;
}

function plAmounts(
  coa: ChartOfAccounts,
  rows: Array<{ account_code: string; balance_yen: number }>,
): Record<
  | "revenue"
  | "cogs"
  | "sga"
  | "non_operating_income"
  | "non_operating_expense"
  | "extraordinary_gain"
  | "extraordinary_loss"
  | "income_tax",
  number
> {
  const totals = {
    revenue: 0,
    cogs: 0,
    sga: 0,
    non_operating_income: 0,
    non_operating_expense: 0,
    extraordinary_gain: 0,
    extraordinary_loss: 0,
    income_tax: 0,
  };
  for (const row of rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (!account) continue;
    const section = statementSectionOf(account);
    if (!section) continue;
    const amount = Math.abs(row.balance_yen);
    if (section === "extraordinary_gain") totals.extraordinary_gain += amount;
    else if (section === "extraordinary") totals.extraordinary_loss += amount;
    else totals[section] += amount;
  }
  return totals;
}

function statementSectionOf(account: {
  type: string;
  statement_section?: StatementSection;
}): StatementSection | null {
  if (account.statement_section) return account.statement_section;
  if (account.type === "revenue") return "revenue";
  if (account.type === "expense") return "sga";
  return null;
}

function bsClassAmounts(
  coa: ChartOfAccounts,
  rows: Array<{ account_code: string; balance_yen: number }>,
): {
  current_assets: number;
  noncurrent_assets: number;
  current_liabilities: number;
  noncurrent_liabilities: number;
  unclassified_balance: number;
} {
  const totals = {
    current_assets: 0,
    noncurrent_assets: 0,
    current_liabilities: 0,
    noncurrent_liabilities: 0,
    unclassified_balance: 0,
  };
  for (const row of rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (!account || row.balance_yen === 0) continue;
    const cls = inferBsClass(account);
    const signed =
      account.type === "asset_contra" ? -Math.abs(row.balance_yen) : row.balance_yen;
    if (account.type === "asset" || account.type === "asset_contra") {
      if (cls === "current") totals.current_assets += signed;
      else if (cls === "noncurrent") totals.noncurrent_assets += signed;
      else totals.unclassified_balance += Math.abs(signed);
    } else if (account.type === "liability") {
      if (cls === "current") totals.current_liabilities += signed;
      else if (cls === "noncurrent") totals.noncurrent_liabilities += signed;
      else totals.unclassified_balance += Math.abs(signed);
    }
  }
  return totals;
}

function legalReserveBalance(
  coa: ChartOfAccounts,
  rows: Array<{ account_code: string; balance_yen: number }>,
): number {
  let total = 0;
  for (const row of rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (account?.statutory_role === "legal_reserve") total += row.balance_yen;
  }
  return total;
}

function ledgerDepreciation(): string | null {
  try {
    const methods = [...new Set(loadFixedAssets().assets.map((asset) => asset.depreciation_method))];
    if (methods.length === 0) return null;
    return `固定資産の減価償却の方法は${methods.join("、")}である。`;
  } catch {
    return null;
  }
}

function buildNotes(fiscalYear: string, errors: string[]): StatutoryNote[] {
  const declaration = readYearEndDeclaration(fiscalYear);
  const declared = declaration.ok ? declaration.value.statutory_notes : undefined;
  if (!declared) errors.push("statutory notes declaration missing");

  const depreciation = ledgerDepreciation() ?? declared?.depreciation ?? "";
  if (!depreciation) errors.push("statutory note missing: depreciation");
  if (!declared?.asset_valuation) errors.push("statutory note missing: asset_valuation");
  if (!declared?.provisions) errors.push("statutory note missing: provisions");
  if (!declared?.revenue_and_expense) errors.push("statutory note missing: revenue_and_expense");

  const policy = [
    declared?.asset_valuation ?? "",
    depreciation,
    declared?.provisions ?? "",
    declared?.revenue_and_expense ?? "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const goingConcern = noteWhenDeclared(declared?.going_concern);
  const presentation = noteWhenDeclared(declared?.presentation_change);
  const taxEffect = noteWhenDeclared(declared?.tax_effect);
  const relatedParty = noteWhenDeclared(declared?.related_party);
  const perShare = noteWhenDeclared(declared?.per_share);
  const subsequent = noteWhenDeclared(
    declaration.ok ? declaration.value.subsequent_events : undefined,
  );
  if (goingConcern.missing) errors.push("statutory note missing: going_concern");
  if (presentation.missing) errors.push("statutory note missing: presentation_change");
  if (taxEffect.missing) errors.push("statutory note missing: tax_effect");
  if (relatedParty.missing) errors.push("statutory note missing: related_party");
  if (perShare.missing) errors.push("statutory note missing: per_share");
  if (subsequent.missing) errors.push("statutory note missing: subsequent_events");

  const bodies = [
    goingConcern.body,
    policy,
    presentation.body,
    taxEffect.body,
    relatedParty.body,
    perShare.body,
    subsequent.body,
  ];

  return STATUTORY_NOTE_SPECS.map((spec, index) => ({
    articleId: spec.articleId,
    heading: spec.heading,
    body: bodies[index] ?? "",
  }));
}
