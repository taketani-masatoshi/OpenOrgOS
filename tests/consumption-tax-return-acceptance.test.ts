import { describe, expect, it } from "vitest";
import { runConsumptionTaxReturnRowAcceptance } from "../src/lib/product/consumption-tax-return-acceptance.js";

describe("consumption tax return row acceptance", () => {
  it("scores 100 only when every official check passes", () => {
    const result = runConsumptionTaxReturnRowAcceptance();
    const failed = result.checks.filter((row) => !row.pass);
    expect(failed).toEqual([]);
    expect(result.score).toBe(100);
  });
});
