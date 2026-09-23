/**
 * Sole-prop consumption-tax scoring and yen empty-diff (not-for-etax).
 */
import {
  SOLE_PROP_CONSUMPTION_MARKS,
  SOLE_PROP_CONSUMPTION_REQUIRED_PAGE1_LINES,
  fillSolePropConsumptionReturn,
  solePropConsumptionFormulas,
  type SolePropConsumptionFormula,
  type SolePropConsumptionFacts,
  type SolePropConsumptionLine,
} from "./sole-prop-consumption-tax.js";

function hasCitation(lines: readonly SolePropConsumptionFormula[]): boolean {
  return lines.some((line) => line.formula.startsWith("citation:"));
}

function pairFormula(line: SolePropConsumptionFormula): string {
  return `${line.sheet}|${line.line}|${line.formula}`;
}

function sameFormulas(
  actual: readonly SolePropConsumptionFormula[],
  pinned: readonly SolePropConsumptionFormula[],
): boolean {
  if (pinned.length === 0 || actual.length !== pinned.length) return false;
  const left = actual.map(pairFormula).sort();
  const right = pinned.map(pairFormula).sort();
  return left.every((value, index) => value === right[index]);
}

function lineAmount(
  lines: readonly SolePropConsumptionLine[],
  sheet: string,
  line: string,
): number | null | undefined {
  return lines.find((row) => row.sheet === sheet && row.line === line)?.amount_yen;
}

export function solePropConsumptionRequiredPage1LinesPresent(
  formulas: readonly SolePropConsumptionFormula[] = solePropConsumptionFormulas(),
): boolean {
  for (const line of SOLE_PROP_CONSUMPTION_REQUIRED_PAGE1_LINES) {
    if (!formulas.some((row) => row.sheet === "return_page1" && row.line === line)) return false;
  }
  return true;
}

/**
 * 8 only when the Reiwa 7 November writing-guide formula pin matches (empty diff),
 * page-1 lines ③⑥⑦⑩⑪ are present, submission is not-for-etax, simplified stays blocked,
 * and missing adjustments do not complete as 0. Citation-only formulas score 0.
 * Invented yen pins are not part of this gate (yen is a separate collation).
 */
export function scoreSolePropConsumptionTax(input: {
  pinned: readonly SolePropConsumptionFormula[];
}): 0 | 8 {
  const formulas = solePropConsumptionFormulas();
  if (!solePropConsumptionRequiredPage1LinesPresent(formulas)) return 0;
  if (hasCitation(formulas) || hasCitation(input.pinned)) return 0;
  if (!sameFormulas(formulas, input.pinned)) return 0;
  const probe: SolePropConsumptionFacts = {
    method: "standard",
    taxable_sales_8_yen: 0,
    taxable_sales_10_yen: 0,
    purchase_credit_yen: 0,
    excess_adjustment_yen: "該当なし",
    return_tax_yen: "該当なし",
    bad_debt_yen: "該当なし",
    interim_payment_yen: "該当なし",
  };
  const filled = fillSolePropConsumptionReturn(probe);
  if (filled.submission !== "not-for-etax") return 0;
  if (filled.status !== "ready_for_advisor_review") return 0;
  const simplified = fillSolePropConsumptionReturn({ ...probe, method: "simplified" });
  if (simplified.status !== "blocked") return 0;
  if (simplified.lines.some((line) => line.amount_yen !== null)) return 0;
  const missing = fillSolePropConsumptionReturn({
    ...probe,
    excess_adjustment_yen: undefined,
  });
  if (missing.status !== "blocked") return 0;
  if (lineAmount(missing.lines, "return_page1", "③") !== null) return 0;
  return SOLE_PROP_CONSUMPTION_MARKS;
}

export function solePropConsumptionStatutoryMet(
  pinned: readonly SolePropConsumptionFormula[],
): boolean {
  return scoreSolePropConsumptionTax({ pinned }) === SOLE_PROP_CONSUMPTION_MARKS;
}

/** Separate yen collation against a writing-guide amount pin. Not the 8-point gate. */
export function solePropConsumptionYenDiff(
  lines: readonly SolePropConsumptionLine[],
  pinned: ReadonlyArray<{ sheet: string; line: string; amount_yen: number }>,
): Array<{ sheet: string; line: string; amount_yen: number; actual_yen: number | null }> {
  const byKey = new Map(lines.map((row) => [`${row.sheet}|${row.line}`, row.amount_yen]));
  const diff: Array<{
    sheet: string;
    line: string;
    amount_yen: number;
    actual_yen: number | null;
  }> = [];
  for (const pin of pinned) {
    const actual = byKey.get(`${pin.sheet}|${pin.line}`);
    if (actual === undefined || actual !== pin.amount_yen) {
      diff.push({ ...pin, actual_yen: actual ?? null });
    }
  }
  return diff;
}

export function scoreSolePropConsumptionYen(
  lines: readonly SolePropConsumptionLine[],
  pinned: ReadonlyArray<{ sheet: string; line: string; amount_yen: number }>,
): 0 | 8 {
  if (pinned.length === 0) return 0;
  return solePropConsumptionYenDiff(lines, pinned).length === 0
    ? SOLE_PROP_CONSUMPTION_MARKS
    : 0;
}
