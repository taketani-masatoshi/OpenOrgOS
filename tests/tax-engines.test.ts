import { describe, expect, it } from "vitest";
import {
  assessConsumptionTaxProfile,
  JP_CONSUMPTION_TAX_EXEMPT_THRESHOLD_JPY,
} from "../src/lib/finance/consumption-tax.js";
import {
  computeStraightLineAnnualDepreciation,
  computeAssetMonthlyDepreciation,
  validateDepreciationConsistency,
} from "../src/lib/finance/depreciation.js";
import { loadFixedAssets } from "../src/lib/data.js";
import {
  estimateSocialEmployerRough,
  estimateWithholdingRough,
} from "../src/lib/finance/withholding.js";
import { setTenantId } from "../src/lib/tenant.js";
import { runTaxCalendar, runTaxGaps } from "../src/commands/tax.js";

describe("consumption tax check", () => {
  it("flags TBD status as blocking", () => {
    const r = assessConsumptionTaxProfile({
      consumption_tax: { status: "TBD" },
    });
    expect(r.issues.some((i) => i.code === "status_tbd")).toBe(true);
  });

  it("uses default JP threshold", () => {
    const r = assessConsumptionTaxProfile({
      consumption_tax: {
        status: "免税事業者",
        base_period_sales_jpy: 7_500_000,
      },
    });
    expect(r.threshold_jpy).toBe(JP_CONSUMPTION_TAX_EXEMPT_THRESHOLD_JPY);
    expect(r.taxable_by_sales).toBe(false);
  });
});

describe("depreciation verify", () => {
  it("computes straight-line annual depreciation", () => {
    expect(computeStraightLineAnnualDepreciation(16_600_000, 47)).toBe(353_191);
    expect(computeStraightLineAnnualDepreciation(26_000_000, 34)).toBe(764_705);
  });

  it("validateDepreciationConsistency runs on mal fixtures", () => {
    setTenantId("mal");
    const issues = validateDepreciationConsistency();
    expect(Array.isArray(issues)).toBe(true);
    expect(issues).toEqual([]);
  });

  it("ASSET-003 does not depreciate before placed_in_service_month", () => {
    setTenantId("mal");
    const fa = loadFixedAssets();
    const asset = fa.assets.find((a) => a.id === "ASSET-003");
    expect(asset?.placed_in_service_month).toBe("2027-02");
    expect(asset?.fy_depreciation_jpy).toBe(0);
    expect(computeAssetMonthlyDepreciation(asset!, "2026-07")).toBe(0);
    expect(computeAssetMonthlyDepreciation(asset!, "2027-02")).toBeGreaterThan(0);
  });
});

describe("withholding rough", () => {
  it("estimates 10% withholding and 15% social", () => {
    expect(estimateWithholdingRough(320_000)).toBe(32_000);
    expect(estimateSocialEmployerRough(320_000)).toBe(48_000);
  });
});

describe("tax CLI", () => {
  it("runs calendar and gaps without throwing (mal)", () => {
    setTenantId("mal");
    expect(() => runTaxCalendar({ today: "2026-07-14", json: true })).not.toThrow();
    expect(() => runTaxGaps({ json: true })).not.toThrow();
  });
});
