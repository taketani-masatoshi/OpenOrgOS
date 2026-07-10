import { describe, it, expect } from "vitest";
import {
  computeDashboard,
  collectTasks,
  collectUpcomingPayments,
  resolveFiscalYear,
  formatDashboardMarkdown,
  buildLiquidityOutlook,
  DEFAULT_CASH_TARGET,
  LIQUIDITY_PROJECTION_MONTHS,
} from "../src/lib/dashboard.js";
import { loadAllData } from "../src/lib/data.js";
import type { StewardData } from "../src/lib/data.js";

describe("dashboard", () => {
  it("resolves fiscal year from month", () => {
    expect(resolveFiscalYear(1, "2026-06")).toBe("FY2026");
    expect(resolveFiscalYear(1, "2027-01")).toBe("FY2026");
    expect(resolveFiscalYear(1, "2027-02")).toBe("FY2027");
  });

  it("computes cash flow metrics from live data", () => {
    const report = computeDashboard();
    expect(report.companyName).toBeTruthy();
    expect(report.cashFlow.monthlyRevenue).toBeGreaterThanOrEqual(0);
    expect(report.cashFlow.cashBalance).toBe(10_000_000);
    expect(report.cashFlow.cashFlowMode).toBe("surplus");
    expect(report.cashFlow.runwayMonths).toBeNull();
    expect(report.cashFlow.monthsToCashTarget).not.toBeNull();
    expect(report.cashFlow.monthlyCashSurplus).toBeGreaterThan(0);
    expect(report.kpis.length).toBeGreaterThan(5);
  });

  it("uses surplus terminology when cash flow is positive", () => {
    const report = computeDashboard();
    const liquidity = buildLiquidityOutlook(report.cashFlow);
    const md = formatDashboardMarkdown(report);

    expect(liquidity.primaryLabel).toBe("資金見通し");
    expect(liquidity.netCashFlowLabel).toBe("月次キャッシュ増");
    expect(md).toContain("月次キャッシュ増");
    expect(md).not.toContain("バーンレート");
    expect(report.cashFlow.projectedCashChange).toBe(
      report.cashFlow.monthlyCashSurplus * LIQUIDITY_PROJECTION_MONTHS
    );
  });

  it("computes months to cash target when balance is below goal", () => {
    const data = loadAllData();
    const report = computeDashboard(data);
    const cf = {
      ...report.cashFlow,
      cashBalance: 3_000_000,
      cashFlowMode: "surplus" as const,
      monthlyCashSurplus: 600_000,
      monthlyNetBurn: 0,
      monthsToCashTarget: (DEFAULT_CASH_TARGET - 3_000_000) / 600_000,
      projectedCashChange: 600_000 * LIQUIDITY_PROJECTION_MONTHS,
      projectedCashBalance: 3_000_000 + 600_000 * LIQUIDITY_PROJECTION_MONTHS,
      cashTargetAmount: DEFAULT_CASH_TARGET,
      liquidityProjectionMonths: LIQUIDITY_PROJECTION_MONTHS,
    };
    const liquidity = buildLiquidityOutlook(cf);

    expect(liquidity.primaryLabel).toBe("資金見通し");
    expect(liquidity.primaryNote).toContain("10,000,000");
    expect(liquidity.primaryNote).toContain("11.7");
  });

  it("uses deficit terminology when burning cash", () => {
    const data = loadAllData();
    const report = computeDashboard(data);
    const cf = {
      ...report.cashFlow,
      burnRate: 500_000,
      cashFlowMode: "deficit" as const,
      monthlyCashSurplus: 0,
      monthlyNetBurn: 500_000,
      cashBalance: 5_000_000,
      runwayMonths: 10,
      projectedCashChange: -1_500_000,
      projectedCashBalance: 3_500_000,
    };
    const liquidity = buildLiquidityOutlook(cf);

    expect(liquidity.primaryLabel).toBe("ランウェイ");
    expect(liquidity.primaryValue).toBe("10.0 ヶ月");
    expect(liquidity.netCashFlowLabel).toBe("ネットバーン");
    expect(liquidity.netCashFlowValue).toContain("500");
  });

  it("includes draft insurance as high-importance tasks", () => {
    const data = loadAllData();
    const tasks = collectTasks(data);
    const insurance = tasks.filter((t) => t.id === "CTR-013" || t.id === "CTR-014");
    expect(insurance.length).toBeGreaterThanOrEqual(2);
    expect(insurance.every((t) => t.importance === "high")).toBe(true);
  });

  it("lists TBD items excluding confirmed cash balance", () => {
    const report = computeDashboard();
    expect(report.tbdItems.some((t) => t.includes("現預金"))).toBe(false);
  });

  it("builds monthly trend from yojitsu", () => {
    const report = computeDashboard();
    expect(report.monthlyTrend.length).toBe(12);
    const hotelMonth = report.monthlyTrend.find((t) => t.revenue > 500000);
    expect(hotelMonth).toBeDefined();
  });

  it("formats markdown with key sections", () => {
    const report = computeDashboard();
    const md = formatDashboardMarkdown(report, "## Agent 要約（Steward 読取面）\n");
    expect(md).toContain("# 経営ダッシュボード");
    expect(md).toContain("## 次の支払い");
    expect(md).toContain("## 重要タスク");
    expect(md).toContain("## 緊急タスク");
    expect(md).toContain("Agent 要約");
    expect(md).toContain("cashflow-detail.md");
    expect(md).toContain("月次キャッシュ増");
  });

  it("includes upcoming payments from fixed costs and debt plan", () => {
    const data = loadAllData();
    const fiscalYear = resolveFiscalYear(data.company.fiscal_year_end_month);
    const tasks = collectTasks(data);
    const payments = collectUpcomingPayments(data, fiscalYear, "2026-06-07", tasks);

    expect(payments.length).toBeGreaterThan(0);
    expect(payments.some((p) => p.category === "固定費")).toBe(true);
    expect(payments.some((p) => p.category === "借入返済")).toBe(true);
    expect(payments.every((p) => p.daysRemaining >= 0)).toBe(true);

    const loanPlaceholder = payments.find((p) => p.id.startsWith("LOAN-NONE-"));
    if (loanPlaceholder) {
      expect(loanPlaceholder.dueDate).toMatch(/^2027-01-31$/);
      expect(loanPlaceholder.dueDate).not.toMatch(/^2028-/);
    }

    const report = computeDashboard(data);
    expect(report.upcomingPayments.length).toBeGreaterThan(0);
  });

  it("computes break-even when revenue is positive", () => {
    const data = loadAllData();
    const report = computeDashboard(data);
    if (report.cashFlow.monthlyRevenue > 0 && report.cashFlow.contributionMargin) {
      expect(report.cashFlow.breakEvenRevenue).toBeGreaterThan(0);
    }
  });

  it("uses planned metrics when no monthly finances", () => {
    const data = loadAllData();
    const empty: StewardData = { ...data, monthlyFinances: [] };
    const report = computeDashboard(empty);
    expect(report.cashFlow.source).toBe("planned");
    expect(report.cashFlow.monthlyRevenue).toBeGreaterThan(0);
  });
});
