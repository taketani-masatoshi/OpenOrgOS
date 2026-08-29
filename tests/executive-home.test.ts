import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildExecutiveHome } from "../src/lib/executive-home/build-home.js";

describe("buildExecutiveHome", () => {
  it("returns composed home for mal tenant", () => {
    setTenantId("mal");
    const home = buildExecutiveHome();
    expect(home.ok).toBe(true);
    expect(home.tenant).toBe("mal");
    expect(home.company_name.length).toBeGreaterThan(0);
    expect(home.report_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(home.attention)).toBe(true);
    expect(Array.isArray(home.gaps)).toBe(true);
    expect(home.gap_summary).toMatchObject({
      green: expect.any(Number),
      amber: expect.any(Number),
      red: expect.any(Number),
      unknown: expect.any(Number),
      target_missing: expect.any(Number),
    });
    expect(home.work).toMatchObject({
      employee: expect.any(Array),
      guest: expect.any(Array),
      ai: expect.any(Array),
      unassigned: expect.any(Array),
    });
    expect(home.attention_count).toBe(home.attention.length);
    expect(home.work_open_count).toBe(
      home.work.employee.length +
        home.work.guest.length +
        home.work.ai.length +
        home.work.unassigned.length,
    );
    // P4: business-plan / headcount connected — not left as unknown for core metrics
    const byId = Object.fromEntries(home.gaps.map((g) => [g.id, g]));
    expect(byId["MET-MONTHLY-PROFIT"]?.target_missing).toBe(false);
    expect(byId["MET-CASH-BALANCE"]?.target_missing).toBe(false);
    expect(byId["MET-HEADCOUNT"]?.target_missing).toBe(false);
    expect(byId["MET-REVENUE-VAR-PCT"]?.target_missing).toBe(false);
  });
});
