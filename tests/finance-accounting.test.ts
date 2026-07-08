import { describe, it, expect } from "vitest";
import {
  loadFixedAssets,
  loadTaxProfile,
  loadChartOfAccounts,
  loadExpensePlan,
  loadLoans,
  validateFixedAssetConsistency,
  validateAll,
} from "../src/lib/data.js";

describe("fixed assets accounting", () => {
  it("loads fixed-assets.yaml with valid schema", () => {
    const fa = loadFixedAssets();
    expect(fa.assets).toHaveLength(3);
    expect(fa.as_of).toBe("2027-01-31");
    expect(fa.summary?.total_acquisition_cost).toBe(112_600_000);
  });

  it("loads tax-profile and chart-of-accounts", () => {
    const tax = loadTaxProfile();
    expect(tax.entity.name).toContain("MAL");
    expect(tax.fiscal_year.end_month).toBe(1);

    const coa = loadChartOfAccounts();
    expect(coa.category_mapping.revenue.rent).toBe("4100");
    expect(coa.category_mapping.expense.repair).toBe("5600");
  });

  it("matches FY2026 expense-plan depreciation to fixed-assets summary", () => {
    const fa = loadFixedAssets();
    const expensePlan = loadExpensePlan();
    const fy2026 = expensePlan.years.find((y) => y.fiscal_year === "FY2026");
    const depLine = fy2026?.lines.find((l) => l.id === "depreciation");

    expect(depLine?.amount).toBe(353_191);
    expect(fa.summary?.annual_depreciation_fy_current).toBe(353_191);
    expect(fa.summary?.annual_depreciation_fy_current).toBe(
      fa.assets.find((a) => a.id === "ASSET-001")?.annual_depreciation
    );
  });

  it("links loan balances to total acquisition cost", () => {
    const fa = loadFixedAssets();
    const loans = loadLoans();
    const loanTotal = loans.loans.reduce((s, l) => s + l.balance, 0);
    expect(loanTotal).toBe(112_600_000);
    expect(fa.summary?.total_acquisition_cost).toBe(loanTotal);
  });

  it("passes fixed asset consistency checks", () => {
    const issues = validateFixedAssetConsistency();
    expect(issues).toHaveLength(0);
  });

  it("passes validateAll including fixed assets", () => {
    const result = validateAll();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
