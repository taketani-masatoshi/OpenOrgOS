import { describe, it, expect } from "vitest";
import {
  computeDashboard,
  collectTasks,
  resolveFiscalYear,
  formatDashboardMarkdown,
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
    expect(report.cashFlow.cashBalance).toBeNull();
    expect(report.cashFlow.runwayMonths).toBeNull();
    expect(report.kpis.length).toBeGreaterThan(5);
  });

  it("includes draft insurance as high-importance tasks", () => {
    const data = loadAllData();
    const tasks = collectTasks(data);
    const insurance = tasks.filter((t) => t.id === "CTR-013" || t.id === "CTR-014");
    expect(insurance.length).toBeGreaterThanOrEqual(2);
    expect(insurance.every((t) => t.importance === "high")).toBe(true);
  });

  it("lists TBD items including cash balance", () => {
    const report = computeDashboard();
    expect(report.tbdItems.some((t) => t.includes("現預金"))).toBe(true);
  });

  it("builds monthly trend from yojitsu", () => {
    const report = computeDashboard();
    expect(report.monthlyTrend.length).toBe(12);
    const hotelMonth = report.monthlyTrend.find((t) => t.revenue > 500000);
    expect(hotelMonth).toBeDefined();
  });

  it("formats markdown with key sections", () => {
    const report = computeDashboard();
    const md = formatDashboardMarkdown(report);
    expect(md).toContain("# 経営ダッシュボード");
    expect(md).toContain("## 重要タスク");
    expect(md).toContain("## 緊急タスク");
    expect(md).toContain("cashflow-detail.md");
    expect(md).toContain("バーンレート");
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
