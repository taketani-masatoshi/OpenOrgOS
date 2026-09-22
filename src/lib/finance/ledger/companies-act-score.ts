/**
 * 12 points only when an official published worked example prints yen and the
 * projected statement labels+amounts match that pin with an empty diff.
 * Heading-only match is never 充足. Dummy example_yen must not score 12.
 * Policy B (一段厳格キャンバス): without an official printed-yen pin, full marks
 * for the example_yen row mean proving this hard-0 path with tests — never invent yen.
 * Until a real filled-yen MoJ/NTA/METI (etc.) statement is pinned and compared
 * to statement amounts, this function hard-returns 0 after the label loop.
 * This file does not read the pin fixture and does not rewrite the year-end file.
 * src/ must not import tests/fixtures.
 */
import { readFileSync } from "node:fs";
import { buildStatutoryStatements } from "./statutory-statements.js";

export const COMPANIES_ACT_FULL_MARKS = 12;

export type CompaniesActPinLine = {
  article: string;
  label: string;
  /** Official printed yen only. Absent or non-integer → score 0. */
  example_yen?: number;
};

export type CompaniesActScoreCheck = {
  id: string;
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

export function companiesActDisplayScore(
  labels: readonly string[],
  pinLabels: readonly CompaniesActPinLine[],
): 0 | 12 {
  if (pinLabels.length === 0) return 0;
  if (pinLabels.some((line) => line.article.trim().length === 0)) return 0;
  if (labels.includes("特別損益")) return 0;
  // No official printed yen on the pin → not 充足 (do not invent amounts).
  if (pinLabels.some((line) => !Number.isInteger(line.example_yen))) return 0;
  if (labels.length !== pinLabels.length) return 0;
  for (let index = 0; index < pinLabels.length; index += 1) {
    if (labels[index] !== pinLabels[index]?.label) return 0;
  }
  // Labels match, but keep 0 until real printed yen is compared to statement amounts.
  // Dummy example_yen integers must not award 12.
  return 0;
}

export function runCompaniesActScore(
  fiscalYear: string,
  pinLabels: readonly CompaniesActPinLine[],
): CompaniesActScoreResult {
  const statement = buildStatutoryStatements(fiscalYear);
  const misses: string[] = [];
  if (pinLabels.some((line) => !Number.isInteger(line.example_yen))) {
    misses.push("official printed yen missing on pin");
  } else if (companiesActDisplayScore(statement.displayLabels, pinLabels) !== COMPANIES_ACT_FULL_MARKS) {
    misses.push("display lines or amounts differ from the official worked-example pin");
  }
  if (statement.displayLabels.includes("特別損益")) misses.push("extraordinary items are one line");
  for (const note of statement.notes) {
    if (!note.heading) misses.push("note heading missing");
    if (note.body.length === 0) misses.push(`note body missing: ${note.heading}`);
  }
  if (statement.errors.length > 0) misses.push(statement.errors.join("; "));
  const boundary = sourceBoundary();
  if (boundary) misses.push(boundary);

  const pass = misses.length === 0;
  return {
    score: pass ? COMPANIES_ACT_FULL_MARKS : 0,
    checks: [{ id: "companies-act-lines", pass, detail: misses.join("; ") || "ok" }],
  };
}

function sourceBoundary(): string | null {
  const sources = STATEMENT_SOURCES.map((path) => readFileSync(path, "utf8")).join("\n");
  if (/jp-corporate-tax-xml|from ["'].*eltax|tax-adjustment/.test(sources)) {
    return "statement source imports tax xml, eltax, or tax-adjustment";
  }
  return null;
}
