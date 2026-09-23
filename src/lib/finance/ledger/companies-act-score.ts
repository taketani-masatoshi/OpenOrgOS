/**
 * Development-complete scoring for Companies Act display lines.
 * Full marks when ordinance labels match the pin in order.
 * When pin lines carry example_yen (dev fixture), statement amounts must match too.
 */
import { readFileSync } from "node:fs";
import { buildStatutoryStatements } from "./statutory-statements.js";
import {
  type CompaniesActPinLine,
} from "./companies-act-ordinance-pin.js";

export type { CompaniesActPinLine } from "./companies-act-ordinance-pin.js";
export { COMPANIES_ACT_ORDINANCE_LABEL_PIN } from "./companies-act-ordinance-pin.js";

export const COMPANIES_ACT_FULL_MARKS = 12;

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

/**
 * 12 when labels match pin order. Optional example_yen on a line must equal
 * the parallel statement amount.
 */
export function companiesActDisplayScore(
  labels: readonly string[],
  pinLabels: readonly CompaniesActPinLine[],
  amounts?: readonly (number | null | undefined)[],
): 0 | 12 {
  if (pinLabels.length === 0) return 0;
  if (pinLabels.some((line) => line.article.trim().length === 0)) return 0;
  if (labels.includes("特別損益")) return 0;
  if (labels.length !== pinLabels.length) return 0;
  for (let index = 0; index < pinLabels.length; index += 1) {
    if (labels[index] !== pinLabels[index]?.label) return 0;
  }
  if (amounts !== undefined) {
    if (amounts.length !== pinLabels.length) return 0;
    for (let index = 0; index < pinLabels.length; index += 1) {
      const yen = pinLabels[index]?.example_yen;
      if (!Number.isInteger(yen)) continue;
      if (amounts[index] !== yen) return 0;
    }
  } else if (pinLabels.some((line) => Number.isInteger(line.example_yen))) {
    return 0;
  }
  return COMPANIES_ACT_FULL_MARKS;
}

function asYenOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function statutoryDisplayAmounts(
  statement: ReturnType<typeof buildStatutoryStatements>,
): Array<number | null> {
  const monetary = [...statement.bsRows, ...statement.plRows, ...statement.equityRows].map(
    (row) => asYenOrNull(row.amount),
  );
  const notes = statement.notes.map(() => null);
  return [...monetary, ...notes];
}

export function runCompaniesActScore(
  fiscalYear: string,
  pinLabels: readonly CompaniesActPinLine[],
): CompaniesActScoreResult {
  const statement = buildStatutoryStatements(fiscalYear);
  const misses: string[] = [];
  const amounts = statutoryDisplayAmounts(statement);
  if (companiesActDisplayScore(statement.displayLabels, pinLabels, amounts) !== COMPANIES_ACT_FULL_MARKS) {
    misses.push("display lines or amounts differ from the development pin");
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
