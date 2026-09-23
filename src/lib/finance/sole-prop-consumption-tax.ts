/**
 * Sole-prop general consumption-tax return (一般用).
 * Callers pass sales, purchase credit, and adjustment facts.
 * This module does not read fixture files or corporate annex schedules.
 *
 * tax_exclusive (default): journal bases are 税抜 — ①-1 restores to inclusive once, then rolls back 100/108 or 100/110 once.
 * tax_inclusive: writing-guide printed 税込対価 — skip restore; rollback_once only.
 * Thousand-yen floor is on the taxable-standard rows only, not on ①-1.
 */

export const SOLE_PROP_CONSUMPTION_MARKS = 8;

/** First-table lines that must appear before the formula gate can pass. */
export const SOLE_PROP_CONSUMPTION_REQUIRED_PAGE1_LINES = ["③", "⑥", "⑦", "⑩", "⑪"] as const;

const FLOOR_UNIT_YEN = 1000;
const HUNDRED_YEN = 100;
const PERCENT = 100;
const NATIONAL_REDUCED = { numerator: 624, denominator: 10_000 } as const;
const NATIONAL_STANDARD = { numerator: 78, denominator: 1_000 } as const;
const LOCAL_RATE = { numerator: 22, denominator: 78 } as const;
const FORM_SHEETS = new Set(["return_page1", "return_page2", "schedule_1_3", "schedule_2_3"]);

export type SolePropConsumptionFormula = {
  sheet: string;
  line: string;
  formula: string;
};

export type SolePropAdjustmentFact = number | "該当なし";

/** tax_inclusive: printed tax-inclusive consideration — skip restore; rollback_once only. */
export type SolePropConsumptionSalesBasis = "tax_exclusive" | "tax_inclusive";

export type SolePropConsumptionFacts = {
  method: "standard" | "simplified";
  /** Defaults to tax_exclusive. */
  sales_basis?: SolePropConsumptionSalesBasis;
  taxable_sales_8_yen?: number;
  taxable_sales_10_yen?: number;
  purchase_credit_yen?: number;
  excess_adjustment_yen?: SolePropAdjustmentFact;
  return_tax_yen?: SolePropAdjustmentFact;
  bad_debt_yen?: SolePropAdjustmentFact;
  interim_payment_yen?: SolePropAdjustmentFact;
};

export type SolePropConsumptionLine = {
  sheet: string;
  line: string;
  amount_yen: number | null;
  row_status: "filled" | "blocked";
};

export type SolePropConsumptionReturn = {
  submission: "not-for-etax";
  status: "ready_for_advisor_review" | "blocked";
  lines: SolePropConsumptionLine[];
};

type AdjustmentKey =
  | "excess_adjustment_yen"
  | "return_tax_yen"
  | "bad_debt_yen"
  | "interim_payment_yen";

type Sheet = "schedule_1_3" | "schedule_2_3" | "return_page1" | "return_page2" | "internal";

type Source =
  | { kind: "tax_exclusive"; band: "reduced" | "standard" }
  | { kind: "purchase_credit" }
  | { kind: "adjustment"; key: AdjustmentKey }
  | { kind: "row"; id: string }
  | { kind: "rows"; ids: readonly string[] };

type Transform =
  | { op: "inclusive_rollback_floor"; inclusive: 108 | 110 }
  | { op: "floor_unit"; unitYen: 1000 }
  | { op: "rate_floor"; numerator: number; denominator: number }
  | { op: "purchase_credit" }
  | { op: "identity" }
  | { op: "sum" }
  | { op: "subtract" }
  | { op: "floor_if_nonnegative"; unitYen: 100 }
  | {
      op: "local_payable_floor";
      numerator: 22;
      denominator: 78;
      payableUnitYen: 100;
    };

type ReturnRow = {
  id: string;
  sheet: Sheet;
  line: string;
  source: Source;
  transform: Transform;
};

const ROWS: readonly ReturnRow[] = [
  {
    id: "base_8",
    sheet: "schedule_1_3",
    line: "①-1A",
    source: { kind: "tax_exclusive", band: "reduced" },
    transform: { op: "inclusive_rollback_floor", inclusive: 108 },
  },
  {
    id: "standard_8",
    sheet: "schedule_1_3",
    line: "①A",
    source: { kind: "row", id: "base_8" },
    transform: { op: "floor_unit", unitYen: 1000 },
  },
  {
    id: "base_10",
    sheet: "schedule_1_3",
    line: "①-1B",
    source: { kind: "tax_exclusive", band: "standard" },
    transform: { op: "inclusive_rollback_floor", inclusive: 110 },
  },
  {
    id: "standard_10",
    sheet: "schedule_1_3",
    line: "①B",
    source: { kind: "row", id: "base_10" },
    transform: { op: "floor_unit", unitYen: 1000 },
  },
  {
    id: "tax_8",
    sheet: "schedule_1_3",
    line: "②A",
    source: { kind: "row", id: "standard_8" },
    transform: {
      op: "rate_floor",
      numerator: NATIONAL_REDUCED.numerator,
      denominator: NATIONAL_REDUCED.denominator,
    },
  },
  {
    id: "tax_10",
    sheet: "schedule_1_3",
    line: "②B",
    source: { kind: "row", id: "standard_10" },
    transform: {
      op: "rate_floor",
      numerator: NATIONAL_STANDARD.numerator,
      denominator: NATIONAL_STANDARD.denominator,
    },
  },
  {
    id: "credit",
    sheet: "schedule_2_3",
    line: "㉖",
    source: { kind: "purchase_credit" },
    transform: { op: "purchase_credit" },
  },
  {
    id: "credit_copy",
    sheet: "schedule_1_3",
    line: "④",
    source: { kind: "row", id: "credit" },
    transform: { op: "identity" },
  },
  {
    id: "page2_8",
    sheet: "return_page2",
    line: "⑤",
    source: { kind: "row", id: "standard_8" },
    transform: { op: "identity" },
  },
  {
    id: "page2_10",
    sheet: "return_page2",
    line: "⑥",
    source: { kind: "row", id: "standard_10" },
    transform: { op: "identity" },
  },
  {
    id: "page2_base",
    sheet: "return_page2",
    line: "①",
    source: { kind: "rows", ids: ["page2_8", "page2_10"] },
    transform: { op: "sum" },
  },
  {
    id: "page1_base",
    sheet: "return_page1",
    line: "①",
    source: { kind: "row", id: "page2_base" },
    transform: { op: "identity" },
  },
  {
    id: "page1_tax",
    sheet: "return_page1",
    line: "②",
    source: { kind: "rows", ids: ["tax_8", "tax_10"] },
    transform: { op: "sum" },
  },
  {
    id: "page1_excess",
    sheet: "return_page1",
    line: "③",
    source: { kind: "adjustment", key: "excess_adjustment_yen" },
    transform: { op: "identity" },
  },
  {
    id: "page1_credit",
    sheet: "return_page1",
    line: "④",
    source: { kind: "row", id: "credit_copy" },
    transform: { op: "identity" },
  },
  {
    id: "page1_return",
    sheet: "return_page1",
    line: "⑤",
    source: { kind: "adjustment", key: "return_tax_yen" },
    transform: { op: "identity" },
  },
  {
    id: "page1_bad_debt",
    sheet: "return_page1",
    line: "⑥",
    source: { kind: "adjustment", key: "bad_debt_yen" },
    transform: { op: "identity" },
  },
  {
    id: "page1_deduction",
    sheet: "return_page1",
    line: "⑦",
    source: { kind: "rows", ids: ["page1_credit", "page1_return", "page1_bad_debt"] },
    transform: { op: "sum" },
  },
  {
    id: "gross",
    sheet: "internal",
    line: "gross",
    source: { kind: "rows", ids: ["page1_tax", "page1_excess"] },
    transform: { op: "sum" },
  },
  {
    id: "net",
    sheet: "internal",
    line: "net",
    source: { kind: "rows", ids: ["gross", "page1_deduction"] },
    transform: { op: "subtract" },
  },
  {
    id: "page1_diff",
    sheet: "return_page1",
    line: "⑨",
    source: { kind: "row", id: "net" },
    transform: { op: "floor_if_nonnegative", unitYen: HUNDRED_YEN },
  },
  {
    id: "page1_interim",
    sheet: "return_page1",
    line: "⑩",
    source: { kind: "adjustment", key: "interim_payment_yen" },
    transform: { op: "identity" },
  },
  {
    id: "page1_payable",
    sheet: "return_page1",
    line: "⑪",
    source: { kind: "rows", ids: ["page1_diff", "page1_interim"] },
    transform: { op: "subtract" },
  },
  {
    id: "local_base",
    sheet: "schedule_1_3",
    line: "⑪",
    source: { kind: "row", id: "page1_diff" },
    transform: { op: "identity" },
  },
  {
    id: "local_tax",
    sheet: "schedule_1_3",
    line: "⑬",
    source: { kind: "row", id: "local_base" },
    transform: {
      op: "local_payable_floor",
      numerator: LOCAL_RATE.numerator,
      denominator: LOCAL_RATE.denominator,
      payableUnitYen: HUNDRED_YEN,
    },
  },
  {
    id: "page1_local_base",
    sheet: "return_page1",
    line: "⑱",
    source: { kind: "row", id: "local_base" },
    transform: { op: "identity" },
  },
  {
    id: "page1_local_tax",
    sheet: "return_page1",
    line: "⑳",
    source: { kind: "row", id: "local_tax" },
    transform: { op: "identity" },
  },
];

const ROW_BY_ID = new Map(ROWS.map((row) => [row.id, row]));

export function solePropConsumptionFormulas(): SolePropConsumptionFormula[] {
  return ROWS.filter((row) => FORM_SHEETS.has(row.sheet)).map((row) => ({
    sheet: row.sheet,
    line: row.line,
    formula: formulaOf(row),
  }));
}

export function fillSolePropConsumptionReturn(
  facts: SolePropConsumptionFacts,
): SolePropConsumptionReturn {
  const amounts = new Map<string, number | null>();
  if (facts.method !== "standard") {
    return blockedForm();
  }
  for (const row of ROWS) {
    amounts.set(row.id, amountOf(row, facts, amounts));
  }
  const lines = ROWS.filter((row) => FORM_SHEETS.has(row.sheet)).map((row) => {
    const amount = amounts.get(row.id) ?? null;
    return {
      sheet: row.sheet,
      line: row.line,
      amount_yen: amount,
      row_status: amount === null ? ("blocked" as const) : ("filled" as const),
    };
  });
  const status = lines.every((line) => line.row_status === "filled")
    ? "ready_for_advisor_review"
    : "blocked";
  return { submission: "not-for-etax", status, lines };
}

/**
 * True only when every required page-1 line exists on the derived formula list.
 */
function blockedForm(): SolePropConsumptionReturn {
  return {
    submission: "not-for-etax",
    status: "blocked",
    lines: ROWS.filter((row) => FORM_SHEETS.has(row.sheet)).map((row) => ({
      sheet: row.sheet,
      line: row.line,
      amount_yen: null,
      row_status: "blocked" as const,
    })),
  };
}

function formulaOf(row: ReturnRow): string {
  const transform = row.transform;
  if (transform.op === "purchase_credit") return "purchase_credit";
  if (transform.op === "inclusive_rollback_floor" && row.source.kind === "tax_exclusive") {
    const inclusive = transform.inclusive;
    return `restore:${inclusive}/${PERCENT}|rollback_once:${PERCENT}/${inclusive}`;
  }
  if (transform.op === "identity" && row.source.kind === "adjustment") {
    return `required_input:${row.source.key}`;
  }
  if (transform.op === "identity" && row.source.kind === "row") {
    return `copy:${expressionOf(row.source.id)}`;
  }
  if (transform.op === "sum" && row.source.kind === "rows") {
    return `sum:${row.source.ids.map((id) => expressionOf(id)).join("+")}`;
  }
  if (transform.op === "subtract" && row.source.kind === "rows") {
    return `subtract:${row.source.ids.map((id) => expressionOf(id)).join("-")}`;
  }
  if (transform.op === "floor_unit" && row.source.kind === "row") {
    return `floor_unit:${transform.unitYen}:${expressionOf(row.source.id)}`;
  }
  if (transform.op === "rate_floor" && row.source.kind === "row") {
    return `rate:${transform.numerator}/${transform.denominator}:${expressionOf(row.source.id)}`;
  }
  if (transform.op === "floor_if_nonnegative" && row.source.kind === "row") {
    return `floor100:(${expressionOf(row.source.id)})`;
  }
  if (transform.op === "local_payable_floor" && row.source.kind === "row") {
    return `local:${transform.numerator}/${transform.denominator}:${expressionOf(row.source.id)}|payable_floor:${transform.payableUnitYen}`;
  }
  return "unpinned";
}

function expressionOf(id: string): string {
  const row = ROW_BY_ID.get(id);
  if (!row || row.sheet !== "internal") {
    return row ? `${row.sheet}:${row.line}` : id;
  }
  if (row.transform.op === "sum" && row.source.kind === "rows") {
    return row.source.ids.map((sourceId) => expressionOf(sourceId)).join("+");
  }
  if (row.transform.op === "subtract" && row.source.kind === "rows") {
    return row.source.ids.map((sourceId) => expressionOf(sourceId)).join("-");
  }
  return id;
}

function amountOf(
  row: ReturnRow,
  facts: SolePropConsumptionFacts,
  filled: ReadonlyMap<string, number | null>,
): number | null {
  const values = sourceValues(row, facts, filled);
  if (!values) return null;
  return applyTransform(row.transform, values, facts.sales_basis ?? "tax_exclusive");
}

function sourceValues(
  row: ReturnRow,
  facts: SolePropConsumptionFacts,
  filled: ReadonlyMap<string, number | null>,
): number[] | null {
  const source = row.source;
  if (source.kind === "tax_exclusive") {
    const amount =
      source.band === "reduced" ? facts.taxable_sales_8_yen : facts.taxable_sales_10_yen;
    return oneYen(amount);
  }
  if (source.kind === "purchase_credit") return oneYen(facts.purchase_credit_yen);
  if (source.kind === "adjustment") return oneAdjustment(facts[source.key]);
  const ids = source.kind === "row" ? [source.id] : source.ids;
  const values: number[] = [];
  for (const id of ids) {
    const amount = filled.get(id);
    if (amount === undefined || amount === null) return null;
    values.push(amount);
  }
  return values;
}

function oneYen(amount: number | undefined): number[] | null {
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) return null;
  return [amount];
}

function oneAdjustment(amount: SolePropAdjustmentFact | undefined): number[] | null {
  if (amount === "該当なし") return [0];
  return oneYen(amount);
}

function applyTransform(
  transform: Transform,
  values: number[],
  salesBasis: SolePropConsumptionSalesBasis,
): number {
  const first = values[0] ?? 0;
  if (transform.op === "identity" || transform.op === "purchase_credit") return first;
  if (transform.op === "inclusive_rollback_floor") {
    if (salesBasis === "tax_inclusive") {
      return considerationRollbackOnce(first, transform.inclusive);
    }
    return inclusiveRollbackFloor(first, transform.inclusive);
  }
  if (transform.op === "floor_unit") return floorTo(first, transform.unitYen);
  if (transform.op === "rate_floor") {
    return Math.floor((first * transform.numerator) / transform.denominator);
  }
  if (transform.op === "sum") return values.reduce((total, value) => total + value, 0);
  if (transform.op === "subtract") return first - (values[1] ?? 0);
  if (transform.op === "floor_if_nonnegative") {
    return first >= 0 ? floorTo(first, transform.unitYen) : first;
  }
  return localPayableFloor(first, transform);
}

/** Tax-exclusive: restore to inclusive once, then roll back 100/108 or 100/110 once. */
function inclusiveRollbackFloor(exclusive: number, inclusive: 108 | 110): number {
  const restored = Number((BigInt(exclusive) * BigInt(inclusive)) / BigInt(PERCENT));
  return considerationRollbackOnce(restored, inclusive);
}

/** Tax-inclusive consideration × 100/108 or 100/110, once (writing-guide order). */
function considerationRollbackOnce(inclusiveYen: number, inclusive: 108 | 110): number {
  return Number((BigInt(inclusiveYen) * BigInt(PERCENT)) / BigInt(inclusive));
}

function localPayableFloor(
  value: number,
  transform: { numerator: 22; denominator: 78; payableUnitYen: 100 },
): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.floor((Math.abs(value) * transform.numerator) / transform.denominator);
  const rated = sign * magnitude;
  return rated >= 0 ? floorTo(rated, transform.payableUnitYen) : rated;
}

function floorTo(value: number, unit: number): number {
  return Math.floor(value / unit) * unit;
}

export {
  solePropConsumptionRequiredPage1LinesPresent,
  scoreSolePropConsumptionTax,
  solePropConsumptionStatutoryMet,
  solePropConsumptionYenDiff,
  scoreSolePropConsumptionYen,
} from "./sole-prop-consumption-score.js";
