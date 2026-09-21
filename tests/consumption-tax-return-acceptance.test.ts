import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConsumptionTaxReturnMap } from "../src/lib/finance/consumption-tax-return-rows.js";
import {
  consumptionTaxFormulaScore,
  consumptionTaxReturnFormulas,
  runConsumptionTaxReturnRowAcceptance,
  type FormulaLine,
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

function loadWritingGuideFormulas(): FormulaLine[] {
  return readYamlFile(
    fileURLToPath(
      new URL("./fixtures/consumption-tax-return/writing-guide-formulas.yaml", import.meta.url)
    ),
    formulaPinSchema
  ).rows;
}

describe("consumption tax return row acceptance", () => {
  it("scores 14 only when the external formula diff is empty", () => {
    const pinned = loadWritingGuideFormulas();
    const mapping = loadConsumptionTaxReturnMap();
    const derived = consumptionTaxReturnFormulas(mapping);
    const source = readFileSync(
      new URL("../src/lib/product/consumption-tax-return-acceptance.ts", import.meta.url),
      "utf8"
    );
    expect(mapping.submission).toBe("not-for-etax");
    expect(source).not.toContain("PINNED_FORMULAS");
    expect(source).not.toContain("golden.yaml");
    expect(source).not.toContain("official-coordinates.yaml");
    expect(source).not.toContain("tests/fixtures");
    expect(consumptionTaxFormulaScore(derived, pinned)).toBe(14);
    const result = runConsumptionTaxReturnRowAcceptance(pinned);
    const failed = result.checks.filter((row) => !row.pass);
    expect(failed).toEqual([]);
    expect(result.score).toBe(14);
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
