import { describe, expect, it } from "vitest";
import { todayContextSchema } from "../schemas/steward-chat.js";
import { buildTodayContext } from "../src/lib/steward-chat/today-context.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("steward chat today", () => {
  it("builds TodayContext for demo tenant with max 3 decisions", () => {
    setTenantId("demo");
    const ctx = buildTodayContext();
    const parsed = todayContextSchema.parse(ctx);
    expect(parsed.tenant).toBe("demo");
    expect(parsed.decisions.length).toBeLessThanOrEqual(3);
    expect(Array.isArray(parsed.wire_pending)).toBe(true);
    expect(parsed.report_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not include bank account patterns in KPI values (L1 surface)", () => {
    setTenantId("demo");
    const ctx = buildTodayContext();
    const kpiBlob = JSON.stringify(ctx.kpis);
    expect(kpiBlob).not.toMatch(/\d{7,}/);
  });
});
