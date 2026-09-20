import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateConsumptionTaxFilingAmounts,
  expectedInterimFrequency,
} from "../src/lib/finance/consumption-tax-filing.js";

type Fixture = {
  as_of: string;
  sources: string[];
  interim_frequency: Array<{ prior_national_tax_yen: number; expected: "none" | "annual_1" | "annual_3" | "annual_11" }>;
  filing_rates: Array<{
    label: string;
    taxable_sales_10_yen: number;
    taxable_sales_8_yen: number;
    expected_national_yen: number;
    expected_local_yen: number;
    expected_combined_yen: number;
  }>;
};

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/consumption-tax/nta-statutory-vectors.json", import.meta.url)), "utf-8")) as Fixture;

describe("NTA-backed consumption-tax statutory vectors", () => {
  it("keeps dated primary-source provenance", () => {
    expect(fixture.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fixture.sources.length).toBeGreaterThanOrEqual(3);
    expect(fixture.sources.every((url) => url.startsWith("https://www.nta.go.jp/"))).toBe(true);
  });

  it.each(fixture.interim_frequency)("maps $prior_national_tax_yen to $expected", (row) => {
    expect(expectedInterimFrequency(row.prior_national_tax_yen, false)).toBe(row.expected);
  });

  it.each(fixture.filing_rates)("matches $label", (row) => {
    const actual = calculateConsumptionTaxFilingAmounts({
      taxable_sales_10_yen: row.taxable_sales_10_yen,
      taxable_sales_8_yen: row.taxable_sales_8_yen,
      deductible_input_tax_yen: 0,
    });
    expect(actual.national_tax_yen).toBe(row.expected_national_yen);
    expect(actual.local_consumption_tax_yen).toBe(row.expected_local_yen);
    expect(actual.combined_tax_yen).toBe(row.expected_combined_yen);
  });
});
