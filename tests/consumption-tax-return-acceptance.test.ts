import { describe, expect, it } from "vitest";
import {
  consumptionTaxFormulaScore,
  runConsumptionTaxReturnRowAcceptance,
} from "../src/lib/product/consumption-tax-return-acceptance.js";

describe("consumption tax return row acceptance", () => {
  it("scores 14 only when the pinned formulas match", () => {
    const result = runConsumptionTaxReturnRowAcceptance();
    const failed = result.checks.filter((row) => !row.pass);
    expect(failed).toEqual([]);
    expect(result.score).toBe(14);
  });

  it("scores 0 when the only evidence is a non-empty citation", () => {
    expect(
      consumptionTaxFormulaScore([
        { sheet: "return_page1", line: "①", formula: "citation:国税庁 令和7年11月" },
      ]),
    ).toBe(0);
  });
});
