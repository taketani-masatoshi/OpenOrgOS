import { describe, expect, it } from "vitest";
import {
  buildTaxCalendarPortfolio,
  formatAmountEstimate,
} from "../src/lib/finance/tax-calendar-portfolio.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("buildTaxCalendarPortfolio", () => {
  it("expands monthly withholding/social and lodging with rough amounts (mal · 2026-07-14)", () => {
    setTenantId("mal");
    const p = buildTaxCalendarPortfolio({ today: "2026-07-14" });

    const gensen = p.rows.filter((r) => r.tax.includes("源泉"));
    const shaho = p.rows.filter((r) => r.tax.includes("社会保険"));
    const lodging = p.rows.filter((r) => r.tax.includes("宿泊税"));

    expect(gensen.length).toBeGreaterThanOrEqual(1);
    expect(shaho.length).toBeGreaterThanOrEqual(1);
    expect(lodging.some((r) => r.deadline === "2026-08-31")).toBe(true);

    expect(gensen.some((r) => (r.amount_estimate_jpy ?? 0) > 0)).toBe(true);
    expect(shaho.some((r) => (r.amount_estimate_jpy ?? 0) > 0)).toBe(true);

    expect(p.stats.outflow_3m_jpy).toBeGreaterThan(0);
    expect(formatAmountEstimate(p.stats.outflow_3m_jpy)).toMatch(/^約/);

    expect(p.rows.some((r) => r.tax.includes("消費税"))).toBe(false);

    const nenmatsu = p.calendar_events.some((e) =>
      e.label.includes("年末調整"),
    );
    const hotei = p.calendar_events.some((e) =>
      e.label.includes("法定調書"),
    );
    expect(nenmatsu || hotei).toBe(true);
  });

  it("reads lodging tax amounts from hospitality ledger (from_ledger)", () => {
    setTenantId("mal");
    const p = buildTaxCalendarPortfolio({ today: "2026-09-10" });
    const lodging = p.rows.filter(
      (r) => r.tax.includes("宿泊税") && r.period_label.includes("2026-08"),
    );
    expect(lodging.length).toBeGreaterThanOrEqual(1);
    expect(lodging[0]?.amount_estimate_jpy).toBe(1000);
    expect(lodging[0]?.amount_confidence).toBe("ledger");
  });

  it("includes fixed asset tax and corporate tax from obligation rhythms", () => {
    setTenantId("mal");
    const p = buildTaxCalendarPortfolio({ today: "2026-07-14" });
    expect(
      p.rows.some((r) => r.tax.includes("固定資産税")) ||
        p.calendar_events.some((e) => e.label.includes("固定資産税")),
    ).toBe(true);
    expect(
      p.calendar_events.some((e) => e.label.includes("法人税")),
    ).toBe(true);
  });
});
