/**
 * 14 points only when each return line's formula matches the pinned list.
 * A non-empty citation is not a pass. golden.yaml is not read.
 */
import type { ConsumptionTaxReturnMapRow } from "../../../schemas/finance/consumption-tax-return-map.js";
import { loadConsumptionTaxReturnMap } from "../finance/consumption-tax-return-rows.js";

export const CONSUMPTION_TAX_FULL_MARKS = 14;

const FORM_SHEETS = new Set(["return_page1", "return_page2", "schedule_1_3", "schedule_2_3"]);

/** Sheet, line, and formula. Citations are intentionally absent. */
const PINNED_FORMULAS: ReadonlyArray<{ sheet: string; line: string; formula: string }> = [
  { sheet: "schedule_1_3", line: "①-1A", formula: "input:taxable_sales_8_yen|floor_unit:1000" },
  { sheet: "schedule_1_3", line: "①-1B", formula: "input:taxable_sales_10_yen|floor_unit:1000" },
  { sheet: "schedule_1_3", line: "②A", formula: "rate:624/10000:schedule_1_3_base_8" },
  { sheet: "schedule_1_3", line: "②B", formula: "rate:78/1000:schedule_1_3_base_10" },
  { sheet: "schedule_2_3", line: "㉖", formula: "purchase_credit" },
  { sheet: "schedule_1_3", line: "④", formula: "identity:schedule_2_3_credit" },
  { sheet: "return_page2", line: "⑤", formula: "identity:schedule_1_3_base_8" },
  { sheet: "return_page2", line: "⑥", formula: "identity:schedule_1_3_base_10" },
  { sheet: "return_page2", line: "①", formula: "sum:return_page2_base_8+return_page2_base_10" },
  { sheet: "return_page1", line: "①", formula: "identity:return_page2_base" },
  { sheet: "return_page1", line: "②", formula: "sum:schedule_1_3_tax_8+schedule_1_3_tax_10" },
  { sheet: "return_page1", line: "③", formula: "input:excess_adjustment_yen|identity" },
  { sheet: "return_page1", line: "④", formula: "identity:schedule_1_3_credit" },
  { sheet: "return_page1", line: "⑤", formula: "input:return_tax_yen|identity" },
  { sheet: "return_page1", line: "⑥", formula: "input:bad_debt_yen|identity" },
  { sheet: "return_page1", line: "⑦", formula: "sum:return_page1_4+return_page1_5+return_page1_6" },
  { sheet: "return_page1", line: "⑨", formula: "floor100:internal_net" },
  { sheet: "return_page1", line: "⑩", formula: "input:interim_payment_yen|identity" },
  { sheet: "return_page1", line: "⑪", formula: "subtract:return_page1_9-return_page1_10" },
  { sheet: "schedule_1_3", line: "⑪", formula: "identity:return_page1_9" },
  { sheet: "schedule_1_3", line: "⑬", formula: "local:22/78:schedule_1_3_11" },
  { sheet: "return_page1", line: "⑱", formula: "identity:schedule_1_3_11" },
  { sheet: "return_page1", line: "⑳", formula: "identity:schedule_1_3_13" },
];

export type FormulaLine = { sheet: string; line: string; formula: string };

export function consumptionTaxFormulaScore(lines: readonly FormulaLine[]): 0 | 14 {
  if (lines.some((line) => line.formula.startsWith("citation:"))) return 0;
  const actual = lines.map(pair).sort();
  const pinned = PINNED_FORMULAS.map(pair).sort();
  if (actual.length !== pinned.length) return 0;
  for (let index = 0; index < pinned.length; index += 1) {
    if (actual[index] !== pinned[index]) return 0;
  }
  return CONSUMPTION_TAX_FULL_MARKS;
}

export function runConsumptionTaxReturnRowAcceptance(): {
  score: number;
  checks: Array<{ id: string; pass: boolean; detail: string }>;
} {
  const mapping = loadConsumptionTaxReturnMap();
  const lines = mapping.rows.filter((row) => FORM_SHEETS.has(row.sheet)).map((row) => ({
    sheet: row.sheet,
    line: row.line,
    formula: formulaOf(row),
  }));
  const score =
    mapping.submission === "not-for-etax" ? consumptionTaxFormulaScore(lines) : 0;
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

function formulaOf(row: ConsumptionTaxReturnMapRow): string {
  const transform = row.transform;
  if (transform.op === "purchase_credit") return "purchase_credit";
  if (transform.op === "floor_unit" && row.source.kind === "input") {
    return `input:${row.source.key}|floor_unit:${transform.unit_yen}`;
  }
  if (transform.op === "identity" && row.source.kind === "input") {
    return `input:${row.source.key}|identity`;
  }
  if (transform.op === "identity" && row.source.kind === "row") return `identity:${row.source.id}`;
  if (transform.op === "sum" && row.source.kind === "rows") return `sum:${row.source.ids.join("+")}`;
  if (transform.op === "subtract" && row.source.kind === "rows") {
    return `subtract:${row.source.ids.join("-")}`;
  }
  if (transform.op === "rate_floor" && row.source.kind === "row") {
    return `rate:${transform.numerator}/${transform.denominator}:${row.source.id}`;
  }
  if (transform.op === "floor_if_nonnegative" && row.source.kind === "row") {
    return `floor100:${row.source.id}`;
  }
  if (transform.op === "signed_rate_then_payable_floor" && row.source.kind === "row") {
    return `local:${transform.numerator}/${transform.denominator}:${row.source.id}`;
  }
  return "unpinned";
}

function pair(line: FormulaLine): string {
  return `${line.sheet}|${line.line}|${line.formula}`;
}
