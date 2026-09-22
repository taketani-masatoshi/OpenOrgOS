import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  SOLE_PROP_CONSUMPTION_MARKS,
  SOLE_PROP_CONSUMPTION_REQUIRED_PAGE1_LINES,
  fillSolePropConsumptionReturn,
  scoreSolePropConsumptionTax,
  scoreSolePropConsumptionYen,
  solePropConsumptionFormulas,
  solePropConsumptionRequiredPage1LinesPresent,
  solePropConsumptionStatutoryMet,
  solePropConsumptionYenDiff,
  type SolePropConsumptionFacts,
  type SolePropConsumptionFormula,
} from "../src/lib/finance/sole-prop-consumption-tax.js";

/** Exclusive bases for arithmetic structure only — not an official printed pin. */
const EXAMPLE: SolePropConsumptionFacts = {
  method: "standard",
  taxable_sales_8_yen: 10_900,
  taxable_sales_10_yen: 11_900,
  purchase_credit_yen: 100,
  excess_adjustment_yen: "該当なし",
  return_tax_yen: "該当なし",
  bad_debt_yen: "該当なし",
  interim_payment_yen: "該当なし",
};

const STRUCTURAL_YEN = [
  { sheet: "schedule_1_3", line: "①-1A", yen: 10_900 },
  { sheet: "schedule_1_3", line: "①-1B", yen: 11_900 },
  { sheet: "schedule_1_3", line: "①A", yen: 10_000 },
  { sheet: "schedule_1_3", line: "①B", yen: 11_000 },
  { sheet: "schedule_1_3", line: "②A", yen: 624 },
  { sheet: "schedule_1_3", line: "②B", yen: 858 },
  { sheet: "return_page1", line: "①", yen: 21_000 },
  { sheet: "return_page1", line: "②", yen: 1_482 },
  { sheet: "return_page1", line: "③", yen: 0 },
  { sheet: "return_page1", line: "⑨", yen: 1_300 },
  { sheet: "return_page1", line: "⑪", yen: 1_300 },
];

function loadFormulas(): SolePropConsumptionFormula[] {
  const parsed = YAML.parse(
    readFileSync("tests/fixtures/sole-prop/consumption-formulas.yaml", "utf-8"),
  ) as { rows: SolePropConsumptionFormula[]; source?: { label?: string; url?: string } };
  return parsed.rows;
}

function loadWritingGuideYen(): {
  source: { label: string; url: string };
  inclusive_inputs: { taxable_sales_8_yen: number; taxable_sales_10_yen: number };
  rows: Array<{ sheet: string; line: string; amount_yen: number }>;
} {
  return YAML.parse(
    readFileSync("tests/fixtures/sole-prop/consumption-writing-guide-yen.yaml", "utf-8"),
  ) as {
    source: { label: string; url: string };
    inclusive_inputs: { taxable_sales_8_yen: number; taxable_sales_10_yen: number };
    rows: Array<{ sheet: string; line: string; amount_yen: number }>;
  };
}

function yenOf(
  lines: Array<{ sheet: string; line: string; amount_yen: number | null }>,
  sheet: string,
  line: string,
): number | null | undefined {
  return lines.find((row) => row.sheet === sheet && row.line === line)?.amount_yen;
}

describe("sole prop consumption tax", () => {
  it("scores 8 when Reiwa 7 November formulas match and page1 ③⑥⑦⑩⑪ are present", () => {
    const pinned = loadFormulas();
    const source = readFileSync("src/lib/finance/sole-prop-consumption-tax.ts", "utf-8");
    const derived = solePropConsumptionFormulas();
    expect(source).not.toContain("tests/fixtures");
    expect(source).not.toContain("別表四");
    expect(source).not.toContain("tax-adjustment");
    expect(solePropConsumptionRequiredPage1LinesPresent(derived)).toBe(true);
    for (const line of SOLE_PROP_CONSUMPTION_REQUIRED_PAGE1_LINES) {
      expect(
        derived.some((row) => row.sheet === "return_page1" && row.line === line),
        `return_page1 ${line}`,
      ).toBe(true);
    }
    expect(derived).toEqual(pinned);
    expect(scoreSolePropConsumptionTax({ pinned })).toBe(SOLE_PROP_CONSUMPTION_MARKS);
    expect(solePropConsumptionStatutoryMet(pinned)).toBe(true);
  });

  it("fills exclusive bases with restore-then-rollback and floors the taxable standard", () => {
    const filled = fillSolePropConsumptionReturn(EXAMPLE);
    expect(filled.submission).toBe("not-for-etax");
    expect(filled.status).toBe("ready_for_advisor_review");
    for (const row of STRUCTURAL_YEN) {
      expect(yenOf(filled.lines, row.sheet, row.line), `${row.sheet} ${row.line}`).toBe(row.yen);
    }
    expect(yenOf(filled.lines, "schedule_1_3", "①-1B")).not.toBe(13_000);
    expect(yenOf(filled.lines, "schedule_1_3", "①-1B")).not.toBe(10_000);
    expect(yenOf(filled.lines, "schedule_1_3", "②B")).not.toBe(1_190);
  });

  it("keeps writing-guide yen as a separate collation (tax_inclusive, no invented yen)", () => {
    const pin = loadWritingGuideYen();
    expect(pin.source.label).toContain("令和7年11月");
    expect(pin.source.url).toContain("202411_01.pdf");
    const filled = fillSolePropConsumptionReturn({
      method: "standard",
      sales_basis: "tax_inclusive",
      taxable_sales_8_yen: pin.inclusive_inputs.taxable_sales_8_yen,
      taxable_sales_10_yen: pin.inclusive_inputs.taxable_sales_10_yen,
      purchase_credit_yen: 0,
      excess_adjustment_yen: "該当なし",
      return_tax_yen: "該当なし",
      bad_debt_yen: "該当なし",
      interim_payment_yen: "該当なし",
    });
    expect(solePropConsumptionYenDiff(filled.lines, pin.rows)).toEqual([]);
    expect(scoreSolePropConsumptionYen(filled.lines, pin.rows)).toBe(SOLE_PROP_CONSUMPTION_MARKS);
    expect(yenOf(filled.lines, "schedule_1_3", "①-1A")).toBe(188_775_925);
    expect(yenOf(filled.lines, "schedule_1_3", "①A")).toBe(188_775_000);
  });

  it("scores 0 when the only evidence is a citation", () => {
    expect(
      scoreSolePropConsumptionTax({
        pinned: [{ sheet: "return_page1", line: "①", formula: "citation:国税庁 令和7年11月" }],
      }),
    ).toBe(0);
    expect(
      solePropConsumptionStatutoryMet([
        { sheet: "return_page1", line: "①", formula: "citation:国税庁 令和7年11月" },
      ]),
    ).toBe(false);
  });

  it("scores 0 when a required page1 line is missing from the formula pin", () => {
    const formulas = loadFormulas().filter(
      (line) => !(line.sheet === "return_page1" && line.line === "③"),
    );
    expect(scoreSolePropConsumptionTax({ pinned: formulas })).toBe(0);
  });

  it("blocks a missing adjustment and does not complete simplified tax", () => {
    const missing = fillSolePropConsumptionReturn({
      ...EXAMPLE,
      excess_adjustment_yen: undefined,
    });
    expect(missing.status).toBe("blocked");
    expect(yenOf(missing.lines, "return_page1", "③")).toBeNull();
    const statedNone = fillSolePropConsumptionReturn(EXAMPLE);
    expect(statedNone.status).toBe("ready_for_advisor_review");
    expect(yenOf(statedNone.lines, "return_page1", "③")).toBe(0);
    const simplified = fillSolePropConsumptionReturn({ ...EXAMPLE, method: "simplified" });
    expect(simplified.submission).toBe("not-for-etax");
    expect(simplified.status).toBe("blocked");
    expect(yenOf(simplified.lines, "return_page1", "①")).toBeNull();
    expect(scoreSolePropConsumptionTax({ pinned: loadFormulas() })).toBe(8);
  });
});
