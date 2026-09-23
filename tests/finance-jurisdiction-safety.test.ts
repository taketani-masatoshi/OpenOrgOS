import { afterEach, describe, expect, it, vi } from "vitest";
import * as jurisdiction from "../src/lib/jurisdiction.js";
import {
  evaluateIndirectTaxClose,
  type JpIndirectTaxEngine,
} from "../src/lib/finance/indirect-tax/port.js";
import { computePayrollMonth } from "../src/lib/finance/payroll-jp.js";
import { buildConsumptionTaxSummary } from "../src/lib/finance/consumption-tax.js";
import { computeYearEndAdjustment } from "../src/lib/finance/payroll-bonus-yea.js";
import { calculateSolePropIncomeTaxAmounts } from "../src/lib/finance/income-tax-policy.js";
import { computeAssetMonthlyDepreciation } from "../src/lib/finance/depreciation.js";
import { readAnnualPayrollSource } from "../src/lib/finance/payroll-annual-source.js";
import { buildSolePropBlueReturn } from "../src/lib/finance/sole-prop-blue-return.js";

describe("foreign jurisdictions cannot silently use Japanese engines", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(["EE", "GE", "US"])(
    "blocks unimplemented tax close and JP calculations for %s",
    (code) => {
      const base = jurisdiction.getResolvedJurisdiction();
      vi.spyOn(jurisdiction, "getResolvedJurisdiction").mockReturnValue({
        ...base,
        code,
        pack: { ...base.pack, tax_profile_schema: "corporate", indirect_tax_family: "vat_credit" },
      });
      const fail = () => {
        throw new Error("JP engine must not run");
      };
      const engine: JpIndirectTaxEngine = {
        missingLineTaxCodes: fail,
        summarize: fail,
        profileBlocking: fail,
      };
      expect(evaluateIndirectTaxClose("2026-09", engine)).toMatchObject({
        pass: false,
        engine: "uninstalled",
      });
      expect(() => computePayrollMonth({ month: "2026-09", grossYen: 280000 })).toThrow(
        "Japanese finance engine"
      );
      expect(() => buildConsumptionTaxSummary({ period: "2026-09" })).toThrow(
        "Japanese finance engine"
      );
      expect(() => computeYearEndAdjustment("FY2026")).toThrow("Japanese finance engine");
      expect(() =>
        calculateSolePropIncomeTaxAmounts({
          businessIncomeAfterBlueYen: 0,
          otherIncomeYen: 0,
          deductionsYen: 0,
          creditsYen: 0,
          withholdingYen: 0,
          prepaymentYen: 0,
        })
      ).toThrow("Japanese finance engine");
      expect(() =>
        computeAssetMonthlyDepreciation(
          {
            id: "ASSET-001",
            acquisition_cost: 1200000,
            book_value: 100000,
            useful_life_years: 5,
            depreciation_method: "定額法",
          } as never,
          "2026-09"
        )
      ).toThrow("Japanese finance engine");
      expect(() => readAnnualPayrollSource("FY2026")).toThrow("Japanese finance engine");
      expect(() => buildSolePropBlueReturn("FY2026")).toThrow("Japanese finance engine");
    }
  );
  it("accepts explicitly tax-free indirect-tax jurisdiction without invoking JP", () => {
    const base = jurisdiction.getResolvedJurisdiction();
    vi.spyOn(jurisdiction, "getResolvedJurisdiction").mockReturnValue({
      ...base,
      code: "HK",
      pack: { ...base.pack, indirect_tax_family: "none" },
    });
    expect(evaluateIndirectTaxClose("2026-09").pass).toBe(true);
  });
});
