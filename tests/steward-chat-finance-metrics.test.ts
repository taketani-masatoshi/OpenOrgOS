import { describe, expect, it, beforeEach } from "vitest";
import { computeDashboard, selectBasisMonthlyFinance } from "../src/lib/dashboard.js";
import { loadAllData, loadMonthlyFinance } from "../src/lib/data.js";
import {
  handleFinanceMetricsChatMessage,
  isFinanceKpiTopic,
  isFinanceMetricsChatIntent,
  looksLikeFinancePolicyRefusal,
  parseRequestedFinanceMonth,
} from "../src/lib/steward-chat/finance-metrics-intent.js";
import { setTenantId } from "../src/lib/tenant.js";
import { currentMonth, formatCurrency } from "../src/lib/utils.js";

describe("finance metrics chat intent", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("detects burn rate / runway keywords", () => {
    expect(isFinanceMetricsChatIntent("2026年5月のバーンレートは？")).toBe(true);
    expect(isFinanceMetricsChatIntent("ランウェイは何ヶ月？")).toBe(true);
    expect(isFinanceMetricsChatIntent("キャッシュフローは？")).toBe(true);
    expect(isFinanceMetricsChatIntent("Cash Flow を教えて")).toBe(true);
    expect(isFinanceMetricsChatIntent("資金繰りを教えて")).toBe(true);
    expect(isFinanceMetricsChatIntent("2026年1月の売り上げを教えて")).toBe(true);
    expect(isFinanceMetricsChatIntent("売上を教えて")).toBe(true);
    expect(isFinanceMetricsChatIntent("資金繰り表を出して")).toBe(false);
    expect(isFinanceMetricsChatIntent("13週資金繰りを生成")).toBe(false);
    expect(isFinanceMetricsChatIntent("cash flow monthly 3 months write JSON")).toBe(false);
    expect(isFinanceMetricsChatIntent("今日の天気は？")).toBe(false);
  });

  it("detects policy-refusal essays for post-LLM guard", () => {
    expect(isFinanceKpiTopic("バーンレートは？")).toBe(true);
    expect(
      looksLikeFinancePolicyRefusal(
        "経営統括エージェントとして直接データにアクセスすることはできません。Finance Agent へ委譲してください。`npm run orgos -- forecast`"
      )
    ).toBe(true);
  });

  it("parses requested months", () => {
    expect(parseRequestedFinanceMonth("2026年5月のバーンレート")).toBe("2026-05");
    expect(parseRequestedFinanceMonth("burn rate 2026-07")).toBe("2026-07");
  });

  it("returns deterministic metrics matching computeDashboard", () => {
    const expected = computeDashboard().cashFlow;
    const result = handleFinanceMetricsChatMessage("バーンレートとランウェイを教えて");
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.metrics?.burnRate).toBe(expected.burnRate);
    expect(result.metrics?.runwayMonths).toBe(expected.runwayMonths);
    expect(result.metrics?.cashFlowMode).toBe(expected.cashFlowMode);
    const leadAmount =
      expected.cashFlowMode === "surplus"
        ? expected.monthlyCashSurplus
        : expected.monthlyNetBurn;
    expect(result.reply).toContain(formatCurrency(leadAmount));
    expect(result.reply).not.toMatch(/¥XX|シミュレーション|historical_finance|computeDashboard|決定論/);
    if (expected.cashFlowMode === "surplus") {
      expect(result.reply).toContain("該当なし");
      expect(result.reply).not.toContain("cash-balance.yaml の確定が必要");
    }
  });

  it("does not handle unrelated messages", () => {
    expect(handleFinanceMetricsChatMessage("こんにちは").handled).toBe(false);
  });
});

describe("MAL finance metrics (real tenant YAML)", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("uses latest month on or before calendar month — not future stubs", () => {
    const data = loadAllData();
    const asOf = currentMonth();
    const basis = selectBasisMonthlyFinance(data.monthlyFinances, asOf);
    expect(basis).toBeDefined();
    expect(basis!.month <= asOf).toBe(true);
    const cf = computeDashboard(data).cashFlow;
    expect(cf.basisMonth).toBe(basis!.month);
    expect(cf.basisMonth <= asOf).toBe(true);
  });

  it("answers May 2026 burn rate from monthly YAML only", () => {
    const may = loadMonthlyFinance("2026-05");
    expect(may).toBeDefined();
    const rev = may!.revenue.reduce((s, r) => s + r.amount, 0);
    const expAll = may!.expenses.reduce((s, e) => s + e.amount, 0);
    const loan = may!.expenses
      .filter((e) => e.category === "loan_payment")
      .reduce((s, e) => s + e.amount, 0);
    const expectedBurn = expAll - loan + loan - rev; // expenses(non-loan)+loan - rev = expAll - rev
    const burn = expAll - rev;

    const result = handleFinanceMetricsChatMessage("2026年5月のバーンレートを教えて");
    expect(result.ok).toBe(true);
    expect(result.metrics?.company_name).toBe("株式会社MAL");
    expect(result.metrics?.basisMonth).toBe("2026-05");
    expect(result.metrics?.burnRate).toBe(burn);
    expect(result.metrics?.monthlyRevenue).toBe(rev);
    expect(result.reply).toContain(formatCurrency(burn));
    expect(result.reply).not.toMatch(/computeDashboard|決定論|秘書として/);
    expect(expectedBurn).toBe(burn);
  });

  it("answers January 2026 revenue from monthly YAML (not Today as_of only)", () => {
    const jan = loadMonthlyFinance("2026-01");
    expect(jan).toBeDefined();
    const rev = jan!.revenue.reduce((s, r) => s + r.amount, 0);
    const result = handleFinanceMetricsChatMessage("2026年1月の売り上げを教えて");
    expect(result.ok).toBe(true);
    expect(result.metrics?.company_name).toBe("株式会社MAL");
    expect(result.metrics?.basisMonth).toBe("2026-01");
    expect(result.metrics?.monthlyRevenue).toBe(rev);
    expect(result.metrics?.monthlyRevenue).toBe(100_000);
    expect(result.reply).toContain("￥100,000");
    expect(result.reply).toMatch(/2026年1月の売上/);
    expect(result.reply).not.toContain("売上データは含まれていません");
    expect(result.reply).not.toMatch(/computeDashboard|決定論/);
  });

  it("does not invent numbers when month file is missing", () => {
    const result = handleFinanceMetricsChatMessage("2099年1月のバーンレートは？");
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.reply).toContain("未確認");
    expect(result.reply).not.toMatch(/\d{1,3}(,\d{3}){2}/);
  });
});
