import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  loadConsumptionTaxReturnMap,
  projectConsumptionTaxReturnRows,
} from "../src/lib/finance/consumption-tax-return-rows.js";
import {
  CONSUMPTION_TAX_FULL_MARKS,
  CONSUMPTION_TAX_REQUIRED_PAGE1_LINES,
  consumptionTaxFormulaScore,
  consumptionTaxRequiredPage1LinesPresent,
  consumptionTaxReturnFormulas,
  consumptionTaxReturnYenDiff,
  consumptionTaxYenScore,
  runConsumptionTaxReturnRowAcceptance,
  type FormulaLine,
  type YenLine,
} from "../src/lib/product/consumption-tax-return-acceptance.js";
import { readYamlFile } from "../src/lib/utils.js";

const formulaPinSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            sheet: z.string().min(1),
            line: z.string().min(1),
            formula: z.string().min(1),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const yenPinSchema = z
  .object({
    source: z
      .object({
        label: z.string().min(1),
        url: z.string().url(),
      })
      .strict(),
    inclusive_inputs: z
      .object({
        taxable_sales_8_yen: z.number().int().positive(),
        taxable_sales_10_yen: z.number().int().positive(),
      })
      .strict(),
    rows: z
      .array(
        z
          .object({
            sheet: z.string().min(1),
            line: z.string().min(1),
            amount_yen: z.number().int(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const NONE_FACTS = {
  excess_adjustment_yen: "該当なし" as const,
  return_tax_yen: "該当なし" as const,
  bad_debt_yen: "該当なし" as const,
  interim_payment_yen: "該当なし" as const,
};

function loadWritingGuideFormulas(): FormulaLine[] {
  return readYamlFile(
    fileURLToPath(
      new URL("./fixtures/consumption-tax-return/writing-guide-formulas.yaml", import.meta.url)
    ),
    formulaPinSchema
  ).rows;
}

function loadWritingGuideYen(): {
  inclusive_inputs: { taxable_sales_8_yen: number; taxable_sales_10_yen: number };
  rows: YenLine[];
  source: { label: string; url: string };
} {
  return readYamlFile(
    fileURLToPath(
      new URL("./fixtures/consumption-tax-return/writing-guide-yen.yaml", import.meta.url)
    ),
    yenPinSchema
  );
}

function projectWritingGuideScenario() {
  const pin = loadWritingGuideYen();
  return projectConsumptionTaxReturnRows({
    sales_basis: "tax_inclusive",
    bases: {
      taxable_sales_8_yen: pin.inclusive_inputs.taxable_sales_8_yen,
      taxable_sales_10_yen: pin.inclusive_inputs.taxable_sales_10_yen,
      ...NONE_FACTS,
    },
    purchases: { lines: [] },
  });
}

describe("consumption tax return row acceptance", () => {
  it("scores 14 only when Reiwa 7 November formulas match and page1 ③⑥⑦⑩⑪ are required", () => {
    const mapping = loadConsumptionTaxReturnMap();
    const formulas = loadWritingGuideFormulas();
    const projected = projectWritingGuideScenario();
    const pin = loadWritingGuideYen();
    const source = readFileSync(
      new URL("../src/lib/product/consumption-tax-return-acceptance.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toContain("PINNED_FORMULAS");
    expect(source).not.toContain("golden.yaml");
    expect(source).not.toContain("official-coordinates.yaml");
    expect(source).not.toContain("tests/fixtures");
    expect(consumptionTaxRequiredPage1LinesPresent(mapping)).toBe(true);
    for (const line of CONSUMPTION_TAX_REQUIRED_PAGE1_LINES) {
      const row = mapping.rows.find(
        (candidate) => candidate.sheet === "return_page1" && candidate.line === line
      );
      expect(row?.required, `return_page1 ${line}`).toBe(true);
    }
    expect(consumptionTaxFormulaScore(consumptionTaxReturnFormulas(mapping), formulas)).toBe(
      CONSUMPTION_TAX_FULL_MARKS
    );
    const result = runConsumptionTaxReturnRowAcceptance({
      projected,
      pinnedYen: pin.rows,
      pinnedFormulas: formulas,
    });
    const failed = result.checks.filter((row) => !row.pass);
    expect(failed).toEqual([]);
    expect(result.score).toBe(CONSUMPTION_TAX_FULL_MARKS);
    expect(result.statutory_met).toBe(true);
  });

  it("keeps writing-guide yen as a separate collation", () => {
    const pin = loadWritingGuideYen();
    const projected = projectWritingGuideScenario();
    expect(pin.source.label).toContain("令和7年11月");
    expect(pin.source.url).toContain("202411_01.pdf");
    expect(consumptionTaxReturnYenDiff(projected.rows, pin.rows)).toEqual([]);
    expect(consumptionTaxYenScore(projected.rows, pin.rows)).toBe(CONSUMPTION_TAX_FULL_MARKS);
  });

  it("scores 0 when a required page1 line is missing from the formula pin", () => {
    const formulas = loadWritingGuideFormulas().filter(
      (line) => !(line.sheet === "return_page1" && line.line === "③")
    );
    const mapping = loadConsumptionTaxReturnMap();
    expect(consumptionTaxFormulaScore(consumptionTaxReturnFormulas(mapping), formulas)).toBe(0);
    const result = runConsumptionTaxReturnRowAcceptance({
      projected: projectWritingGuideScenario(),
      pinnedFormulas: formulas,
    });
    expect(result.score).toBe(0);
    expect(result.statutory_met).toBe(false);
  });

  it("scores 0 when the only evidence is a non-empty citation", () => {
    expect(
      consumptionTaxFormulaScore([
        { sheet: "return_page1", line: "①", formula: "citation:国税庁 令和7年11月" },
      ])
    ).toBe(0);
  });

  it("scores 0 when the 7.8% line copies the journal 10% tax", () => {
    const pinned = loadWritingGuideFormulas();
    const copied = pinned.map((line) =>
      line.sheet === "schedule_1_3" && line.line === "②B"
        ? { ...line, formula: "journal_tax:10/100" }
        : line
    );
    expect(consumptionTaxFormulaScore(copied, pinned)).toBe(0);
  });
});
