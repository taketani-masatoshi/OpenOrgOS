/**
 * Scores Companies Act financial statements against caller-supplied yen.
 * Expected amounts stay in the acceptance test. This file does not invent them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { evaluateAnnualCloseGates } from "../annual-close.js";
import { yearEndDeclarationPath } from "../year-end-file.js";
import {
  buildStatutoryStatements,
  legalReserveAdditionYen,
} from "./statutory-statements.js";

export type CompaniesActScoreExpected = {
  amounts: Record<string, number>;
  texts: Record<string, string>;
  noteArticleIds: string[];
  noteHeadings: string[];
  policyFragments: string[];
  titles: string[];
};

export type CompaniesActScoreCheck = {
  id: string;
  weight: number;
  pass: boolean;
  detail: string;
};

export type CompaniesActScoreResult = {
  score: number;
  checks: CompaniesActScoreCheck[];
};

const STATEMENT_SOURCES = [
  "src/lib/finance/ledger/statutory-statements.ts",
  "src/lib/finance/ledger/companies-act-statement-map.ts",
  "src/lib/finance/ledger/financial-statement-disclosures.ts",
  "src/lib/finance/kessan-gl.ts",
  "src/lib/kessan-pdf.ts",
];

const OMITTED_NOTE_MARKERS = ["後発", "継続企業", "税効果", "関連当事者", "一株当たり"];

function check(
  id: string,
  weight: number,
  pass: boolean,
  detail: string,
): CompaniesActScoreCheck {
  return { id, weight, pass, detail };
}

function amountsMatch(
  actual: Record<string, number>,
  keys: string[],
  expected: Record<string, number>,
): string[] {
  const misses: string[] = [];
  for (const key of keys) {
    if (actual[key] !== expected[key]) {
      misses.push(`${key}: ${actual[key] ?? "missing"} != ${expected[key]}`);
    }
  }
  return misses;
}

function titlesInOrder(text: string, titles: string[]): boolean {
  let from = -1;
  for (const title of titles) {
    const at = text.indexOf(title, from + 1);
    if (at < 0) return false;
    from = at;
  }
  return true;
}

function boundaryPasses(fiscalYear: string): string[] {
  const problems: string[] = [];
  const sources = STATEMENT_SOURCES.map((path) => readFileSync(path, "utf8")).join("\n");
  if (/jp-corporate-tax-xml|from ["'].*eltax|tax-adjustment/.test(sources)) {
    problems.push("statement source imports tax xml, eltax, or tax-adjustment");
  }
  const path = yearEndDeclarationPath(fiscalYear);
  const original = readFileSync(path, "utf8");
  const withoutSurplus = original
    .split("\n")
    .filter((line) => !line.includes("surplus"))
    .join("\n");
  writeFileSync(path, withoutSurplus);
  try {
    const evaluation = evaluateAnnualCloseGates(fiscalYear);
    if (evaluation.errors.some((issue) => /surplus|剰余金/.test(issue))) {
      problems.push("annual close reports surplus without a declaration");
    }
  } finally {
    writeFileSync(path, original);
  }
  return problems;
}

export function runCompaniesActScore(
  fiscalYear: string,
  expected: CompaniesActScoreExpected,
): CompaniesActScoreResult {
  const statement = buildStatutoryStatements(fiscalYear);
  const checks: CompaniesActScoreCheck[] = [];

  const bsKeys = [
    "current_assets",
    "noncurrent_assets",
    "total_assets",
    "current_liabilities",
    "noncurrent_liabilities",
    "total_liabilities",
    "capital",
    "capital_surplus",
    "retained_earnings",
    "total_net_assets",
    "total_liabilities_and_net_assets",
    "unclassified_balance",
  ];
  const bsMisses = amountsMatch(statement.amounts, bsKeys, expected.amounts);
  checks.push(check("bs-display", 15, bsMisses.length === 0, bsMisses.join("; ") || "ok"));

  const plKeys = [
    "revenue",
    "cogs",
    "gross_profit",
    "sga",
    "operating_profit",
    "non_operating_income",
    "non_operating_expense",
    "ordinary_profit",
    "extraordinary_gain",
    "extraordinary_loss",
    "pretax_profit",
    "income_tax",
    "net_profit",
  ];
  const plMisses = amountsMatch(statement.amounts, plKeys, expected.amounts);
  checks.push(check("pl-display", 15, plMisses.length === 0, plMisses.join("; ") || "ok"));

  const equityKeys = [
    "retained_opening",
    "retained_net_income",
    "retained_dividend",
    "retained_closing",
    "capital_contribution",
  ];
  const equityMisses = amountsMatch(statement.amounts, equityKeys, expected.amounts);
  for (const [key, value] of Object.entries(expected.texts)) {
    if (statement.texts[key] !== value) {
      equityMisses.push(`${key}: ${statement.texts[key] ?? "missing"} != ${value}`);
    }
  }
  checks.push(
    check("equity-roll", 15, equityMisses.length === 0, equityMisses.join("; ") || "ok"),
  );

  const noteProblems: string[] = [];
  for (const articleId of expected.noteArticleIds) {
    if (!statement.notes.some((note) => note.articleId === articleId)) {
      noteProblems.push(`missing ${articleId}`);
    }
  }
  for (const heading of expected.noteHeadings) {
    if (!statement.notes.some((note) => note.heading.includes(heading))) {
      noteProblems.push(`missing heading ${heading}`);
    }
  }
  const policy = statement.notes.find((note) => note.heading.includes("重要な会計方針"));
  for (const fragment of expected.policyFragments) {
    if (!policy?.body.includes(fragment)) noteProblems.push(`policy missing ${fragment}`);
  }
  if (statement.text.includes("発生主義")) noteProblems.push("fixed accrual sentence");
  if (!statement.complete) noteProblems.push("statement incomplete");
  if (statement.errors.some((issue) => OMITTED_NOTE_MARKERS.some((marker) => issue.includes(marker)))) {
    noteProblems.push("omitted note marked the statement incomplete");
  }
  checks.push(
    check("notes-98", 20, noteProblems.length === 0, noteProblems.join("; ") || "ok"),
  );

  const surplusProblems: string[] = [];
  for (const key of ["legal_reserve_addition", "surplus_carryforward"]) {
    if (statement.amounts[key] !== expected.amounts[key]) {
      surplusProblems.push(`${key}: ${statement.amounts[key] ?? "missing"} != ${expected.amounts[key]}`);
    }
  }
  if (statement.text.includes("内部留保として積み立てる")) {
    surplusProblems.push("retained earnings boilerplate");
  }
  const noDividend = legalReserveAdditionYen({
    capitalYen: expected.amounts.capital ?? null,
    existingReserveYen: 0,
    dividendYen: 0,
  });
  if (noDividend.additionYen !== 0 || noDividend.incomplete) {
    surplusProblems.push("no-dividend reserve is not zero");
  }
  const missingCapital = legalReserveAdditionYen({
    capitalYen: null,
    existingReserveYen: 0,
    dividendYen: expected.amounts.retained_dividend ?? 0,
  });
  if (!missingCapital.incomplete) {
    surplusProblems.push("dividend without capital was accepted");
  }
  checks.push(
    check("surplus-22", 15, surplusProblems.length === 0, surplusProblems.join("; ") || "ok"),
  );

  const textProblems: string[] = [];
  if (!titlesInOrder(statement.text, expected.titles)) {
    textProblems.push("titles missing or out of order");
  }
  if (statement.text.trim() === "決算報告書") {
    textProblems.push("cover title used as the statements");
  }
  const labeled = [
    ["流動資産", "current_assets"],
    ["当期純利益", "net_profit"],
    ["利益準備金", "legal_reserve_addition"],
    ["繰越利益剰余金", "surplus_carryforward"],
  ] as const;
  for (const [label, key] of labeled) {
    const line = `${label} ${expected.amounts[key]}`;
    if (!statement.text.includes(line)) textProblems.push(`missing ${line}`);
  }
  for (const heading of expected.noteHeadings) {
    if (!statement.text.includes(heading)) textProblems.push(`text missing ${heading}`);
  }
  checks.push(
    check("statement-text", 10, textProblems.length === 0, textProblems.join("; ") || "ok"),
  );

  const boundary = boundaryPasses(fiscalYear);
  checks.push(check("boundary", 10, boundary.length === 0, boundary.join("; ") || "ok"));

  const score = checks.reduce((sum, item) => sum + (item.pass ? item.weight : 0), 0);
  return { score, checks };
}
