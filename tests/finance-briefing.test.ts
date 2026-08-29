import { describe, expect, it, beforeEach } from "vitest";
import {
  buildFinanceBriefing,
  formatFinanceBriefingMarkdown,
  resolveTaxEstimate,
} from "../src/lib/finance-briefing.js";
import {
  handleFinanceMetricsChatMessage,
  isFinanceBriefingIntent,
} from "../src/lib/steward-chat/finance-metrics-intent.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("finance briefing", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("resolves MAL tax estimate from yojitsu / tax-profile", () => {
    const tax = resolveTaxEstimate("FY2026");
    expect(tax.amount).toBe(775_000);
    expect(tax.source).toMatch(/yojitsu|tax-profile/);
  });

  it("builds a deterministic briefing for MAL", () => {
    const brief = buildFinanceBriefing({ asOfMonth: "2026-07" });
    expect(brief.company_name).toBe("株式会社MAL");
    expect(brief.cashFlow.basisMonth).toBe("2026-07");
    expect(brief.tax.amount).toBe(775_000);
    expect(brief.ytd?.totalRevenue).toBeGreaterThan(0);
    const md = formatFinanceBriefingMarkdown(brief);
    expect(md).toContain("経営・財務ブリーフィング");
    expect(md).toContain("納税見込");
    expect(md).toContain("￥775,000");
    expect(md).toContain("finances briefing");
  });

  it("chat intent routes briefing / tax questions to briefing markdown", () => {
    expect(isFinanceBriefingIntent("経営指標をまとめて")).toBe(true);
    expect(isFinanceBriefingIntent("年度末の納税額の見込みは？")).toBe(true);
    const result = handleFinanceMetricsChatMessage("経営指標と納税見込を教えて");
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.reply).toContain("経営・財務ブリーフィング");
    expect(result.reply).toContain("株式会社MAL");
    expect(result.metrics?.company_name).toBe("株式会社MAL");
  });
});
