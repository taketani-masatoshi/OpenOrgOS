import { describe, expect, it, beforeEach } from "vitest";
import {
  buildTaxCalendarPortfolio,
  formatAmountEstimate,
} from "../src/lib/finance/tax-calendar-portfolio.js";
import { loadTaxProfile } from "../src/lib/data.js";
import { setTenantId } from "../src/lib/tenant.js";

// Read against a fixture tenant. These assertions used to name one operator's
// real tenant and its configured taxes, which meant they only held while that
// tenant's books were on the tip. The behaviour under test is the mapping from
// obligation_rhythms to rows and calendar events, so the fixture states which
// rhythms it configures and the test derives its expectations from that.
describe("buildTaxCalendarPortfolio", () => {
  beforeEach(() => {
    setTenantId("_fixture-books");
  });

  function configuredLabels(): Set<string> {
    return new Set(
      (loadTaxProfile().obligation_rhythms ?? [])
        .filter((r) => r.enabled !== false)
        .map((r) => r.label),
    );
  }

  it("emits rows only for obligation rhythms the tenant configures", () => {
    const configured = configuredLabels();
    expect(configured.size).toBeGreaterThan(0);

    const p = buildTaxCalendarPortfolio({ today: "2026-07-14" });
    expect(p.rows.length).toBeGreaterThan(0);

    for (const row of p.rows) {
      expect(configured).toContain(row.tax);
    }
    for (const event of p.calendar_events) {
      expect(configured).toContain(event.label);
    }

    // The inverse: a tax with no rhythm must not appear. 事業所税 is not
    // configured here, so nothing may invent it.
    expect(configured.has("事業所税")).toBe(false);
    expect(p.rows.some((r) => r.tax.includes("事業所税"))).toBe(false);
  });

  it("estimates monthly withholding and social insurance from payroll", () => {
    const p = buildTaxCalendarPortfolio({ today: "2026-07-14" });

    const gensen = p.rows.filter((r) => r.tax.includes("源泉"));
    const shaho = p.rows.filter((r) => r.tax.includes("社会保険"));
    expect(gensen.length).toBeGreaterThanOrEqual(1);
    expect(shaho.length).toBeGreaterThanOrEqual(1);

    // Derived from payroll, so "rough" rather than a figure anyone filed.
    expect(gensen.some((r) => (r.amount_estimate_jpy ?? 0) > 0)).toBe(true);
    expect(shaho.some((r) => (r.amount_estimate_jpy ?? 0) > 0)).toBe(true);
    expect(gensen[0]?.amount_confidence).toBe("rough");

    expect(p.stats.outflow_3m_jpy).toBeGreaterThan(0);
    expect(formatAmountEstimate(p.stats.outflow_3m_jpy)).toMatch(/^約/);
  });

  it("reads the amount from the ledger when the rhythm says from_ledger", () => {
    const p = buildTaxCalendarPortfolio({ today: "2026-09-10" });

    const assessed = p.rows.filter(
      (r) => r.tax.includes("宿泊税") && r.period_label.includes("2026-08"),
    );
    expect(assessed.length).toBeGreaterThanOrEqual(1);
    // tenants/_fixture-books/data/operations/lodging-tax.yaml assesses ¥1,000
    // for 2026-08; a ledger figure outranks a formula and is not "rough".
    expect(assessed[0]?.amount_estimate_jpy).toBe(1000);
    expect(assessed[0]?.amount_confidence).toBe("ledger");

    // A month the ledger does not assess carries no invented amount.
    const unassessed = p.rows.filter(
      (r) => r.tax.includes("宿泊税") && r.period_label.includes("2026-07"),
    );
    expect(unassessed.length).toBeGreaterThanOrEqual(1);
    expect(unassessed[0]?.amount_estimate_jpy).toBeNull();
  });

  it("places an annual obligation on the calendar at its fixed date", () => {
    const p = buildTaxCalendarPortfolio({ today: "2026-07-14" });

    // shohi-annual is cadence: annual, due_rule: fixed_md, month 3 day 31.
    const annual = p.calendar_events.filter((e) => e.label.includes("消費税"));
    expect(annual.length).toBeGreaterThanOrEqual(1);
    expect(annual.every((e) => e.date.endsWith("-03-31"))).toBe(true);
  });
});
