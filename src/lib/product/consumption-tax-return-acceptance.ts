/**
 * 14 points only when derived formulas match the pin the caller supplies.
 * A formula that starts with citation: is not a pass. Fixture files are not read here.
 */
import type {
  ConsumptionTaxReturnMap,
  ConsumptionTaxReturnMapRow,
} from "../../../schemas/finance/consumption-tax-return-map.js";
import { loadConsumptionTaxReturnMap } from "../finance/consumption-tax-return-rows.js";

export const CONSUMPTION_TAX_FULL_MARKS = 14;

const FORM_SHEETS = new Set(["return_page1", "return_page2", "schedule_1_3", "schedule_2_3"]);

export type FormulaLine = { sheet: string; line: string; formula: string };

export function consumptionTaxReturnFormulas(mapping: ConsumptionTaxReturnMap): FormulaLine[] {
  const byId = new Map(mapping.rows.map((row) => [row.id, row]));
  return mapping.rows
    .filter((row) => FORM_SHEETS.has(row.sheet))
    .map((row) => ({
      sheet: row.sheet,
      line: row.line,
      formula: formulaOf(row, byId),
    }));
}

export function consumptionTaxFormulaScore(
  lines: readonly FormulaLine[],
  pinned: readonly FormulaLine[] = []
): 0 | 14 {
  if (lines.some(isCitation) || pinned.some(isCitation)) return 0;
  if (pinned.length === 0) return 0;
  const actual = lines.map(pair).sort();
  const expected = pinned.map(pair).sort();
  if (actual.length !== expected.length) return 0;
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) return 0;
  }
  return CONSUMPTION_TAX_FULL_MARKS;
}

export function runConsumptionTaxReturnRowAcceptance(pinned: readonly FormulaLine[]): {
  score: number;
  checks: Array<{ id: string; pass: boolean; detail: string }>;
} {
  const mapping = loadConsumptionTaxReturnMap();
  const lines = consumptionTaxReturnFormulas(mapping);
  const score =
    mapping.submission === "not-for-etax" ? consumptionTaxFormulaScore(lines, pinned) : 0;
  return {
    score,
    checks: [
      {
        id: "formula-diff",
        pass: score === CONSUMPTION_TAX_FULL_MARKS,
        detail: score === CONSUMPTION_TAX_FULL_MARKS ? "ok" : "formula diff is not empty",
      },
    ],
  };
}

function formulaOf(
  row: ConsumptionTaxReturnMapRow,
  byId: Map<string, ConsumptionTaxReturnMapRow>
): string {
  const transform = row.transform;
  if (transform.op === "purchase_credit") return "purchase_credit";
  if (transform.op === "inclusive_rollback_floor" && row.source.kind === "input") {
    return `restore:${transform.inclusive_numerator}/${transform.inclusive_denominator}|rollback_once:${transform.rollback_numerator}/${transform.rollback_denominator}`;
  }
  if (transform.op === "identity" && row.source.kind === "input") {
    return `required_input:${row.source.key}`;
  }
  if (transform.op === "identity" && row.source.kind === "row") {
    return `copy:${expressionOf(row.source.id, byId)}`;
  }
  if (transform.op === "sum" && row.source.kind === "rows") {
    return `sum:${row.source.ids.map((id) => expressionOf(id, byId)).join("+")}`;
  }
  if (transform.op === "subtract" && row.source.kind === "rows") {
    return `subtract:${row.source.ids.map((id) => expressionOf(id, byId)).join("-")}`;
  }
  if (transform.op === "floor_unit" && row.source.kind === "row") {
    return `floor_unit:${transform.unit_yen}:${expressionOf(row.source.id, byId)}`;
  }
  if (transform.op === "rate_floor" && row.source.kind === "row") {
    return `rate:${transform.numerator}/${transform.denominator}:${expressionOf(row.source.id, byId)}`;
  }
  if (transform.op === "floor_if_nonnegative" && row.source.kind === "row") {
    return `floor100:(${expressionOf(row.source.id, byId)})`;
  }
  if (transform.op === "signed_rate_then_payable_floor" && row.source.kind === "row") {
    return `local:${transform.numerator}/${transform.denominator}:${expressionOf(row.source.id, byId)}|payable_floor:${transform.payable_unit_yen}`;
  }
  return "unpinned";
}

function expressionOf(id: string, byId: Map<string, ConsumptionTaxReturnMapRow>): string {
  const row = byId.get(id);
  if (!row || row.sheet !== "internal") {
    return row ? `${row.sheet}:${row.line}` : id;
  }
  if (row.transform.op === "sum" && row.source.kind === "rows") {
    return row.source.ids.map((sourceId) => expressionOf(sourceId, byId)).join("+");
  }
  if (row.transform.op === "subtract" && row.source.kind === "rows") {
    return row.source.ids.map((sourceId) => expressionOf(sourceId, byId)).join("-");
  }
  return id;
}

function isCitation(line: FormulaLine): boolean {
  return line.formula.startsWith("citation:");
}

function pair(line: FormulaLine): string {
  return `${line.sheet}|${line.line}|${line.formula}`;
}
