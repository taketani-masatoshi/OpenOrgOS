/**
 * Lane C score (14): empty formula diff against the caller's Reiwa 7 November
 * writing-guide pin, and return page 1 lines ③⑥⑦⑩⑪ marked required on the map.
 * Citation-only formulas and golden self-expect do not score. Fixture files are
 * not read here. Yen pins are a separate collation, not this 14-point gate.
 */
import type {
  ConsumptionTaxReturnMap,
  ConsumptionTaxReturnMapRow,
  ConsumptionTaxReturnRows,
} from "../../../schemas/finance/consumption-tax-return-map.js";
import { loadConsumptionTaxReturnMap } from "../finance/consumption-tax-return-rows.js";

export const CONSUMPTION_TAX_FULL_MARKS = 14;

/** First-table lines that must be required before the 14-point formula gate can pass. */
export const CONSUMPTION_TAX_REQUIRED_PAGE1_LINES = ["③", "⑥", "⑦", "⑩", "⑪"] as const;

const FORM_SHEETS = new Set(["return_page1", "return_page2", "schedule_1_3", "schedule_2_3"]);

export type FormulaLine = { sheet: string; line: string; formula: string };

export type YenLine = { sheet: string; line: string; amount_yen: number };

export type YenDiffLine = YenLine & { actual_yen: number | null };

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

/** True only when every required page-1 line exists on the map with required: true. */
export function consumptionTaxRequiredPage1LinesPresent(
  mapping: ConsumptionTaxReturnMap
): boolean {
  for (const line of CONSUMPTION_TAX_REQUIRED_PAGE1_LINES) {
    const row = mapping.rows.find(
      (candidate) => candidate.sheet === "return_page1" && candidate.line === line
    );
    if (!row?.required) return false;
  }
  return true;
}

/**
 * 14 only when the Reiwa 7 November formula pin matches and page-1 required
 * lines ③⑥⑦⑩⑪ are required on the map. Empty citation formulas score 0.
 */
export function consumptionTaxFormulaScore(
  lines: readonly FormulaLine[],
  pinned: readonly FormulaLine[] = [],
  mapping: ConsumptionTaxReturnMap = loadConsumptionTaxReturnMap()
): 0 | 14 {
  if (!consumptionTaxRequiredPage1LinesPresent(mapping)) return 0;
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

export function consumptionTaxReturnYenDiff(
  rows: readonly { sheet: string; line: string; amount_yen: number | null }[],
  pinned: readonly YenLine[]
): YenDiffLine[] {
  const byKey = new Map(rows.map((row) => [yenKey(row.sheet, row.line), row.amount_yen]));
  const diff: YenDiffLine[] = [];
  for (const pin of pinned) {
    const actual = byKey.get(yenKey(pin.sheet, pin.line));
    if (actual === undefined || actual !== pin.amount_yen) {
      diff.push({ ...pin, actual_yen: actual ?? null });
    }
  }
  return diff;
}

/** Separate yen collation against a writing-guide amount pin. Not the 14-point gate. */
export function consumptionTaxYenScore(
  rows: readonly { sheet: string; line: string; amount_yen: number | null }[],
  pinned: readonly YenLine[]
): 0 | 14 {
  if (pinned.length === 0) return 0;
  return consumptionTaxReturnYenDiff(rows, pinned).length === 0 ? CONSUMPTION_TAX_FULL_MARKS : 0;
}

export function runConsumptionTaxReturnRowAcceptance(input: {
  projected: ConsumptionTaxReturnRows;
  pinnedYen?: readonly YenLine[];
  pinnedFormulas: readonly FormulaLine[];
}): {
  score: number;
  statutory_met: boolean;
  checks: Array<{ id: string; pass: boolean; detail: string }>;
} {
  const mapping = loadConsumptionTaxReturnMap();
  const requiredOk = consumptionTaxRequiredPage1LinesPresent(mapping);
  const formulaScore =
    mapping.submission === "not-for-etax"
      ? consumptionTaxFormulaScore(
          consumptionTaxReturnFormulas(mapping),
          input.pinnedFormulas,
          mapping
        )
      : 0;
  const score =
    requiredOk && formulaScore === CONSUMPTION_TAX_FULL_MARKS ? CONSUMPTION_TAX_FULL_MARKS : 0;
  const checks: Array<{ id: string; pass: boolean; detail: string }> = [
    {
      id: "required-page1-lines",
      pass: requiredOk,
      detail: requiredOk
        ? "ok"
        : `return_page1 ${CONSUMPTION_TAX_REQUIRED_PAGE1_LINES.join("・")} must be required`,
    },
    {
      id: "formula-diff",
      pass: formulaScore === CONSUMPTION_TAX_FULL_MARKS,
      detail:
        formulaScore === CONSUMPTION_TAX_FULL_MARKS
          ? "ok"
          : "Reiwa 7 November formula diff is not empty",
    },
  ];
  if (input.pinnedYen) {
    const yenDiff = consumptionTaxReturnYenDiff(input.projected.rows, input.pinnedYen);
    const yenOk = yenDiff.length === 0;
    checks.push({
      id: "writing-guide-yen-diff",
      pass: yenOk,
      detail: yenOk ? "ok (separate collation)" : `yen diff is not empty (${yenDiff.length})`,
    });
  }
  return {
    score,
    statutory_met: score === CONSUMPTION_TAX_FULL_MARKS,
    checks,
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

function yenKey(sheet: string, line: string): string {
  return `${sheet}|${line}`;
}
