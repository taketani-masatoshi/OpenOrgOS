import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeYearEndAdjustment,
  summarizeYearEndAdjustment,
} from "../src/lib/finance/payroll-bonus-yea.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";

describe("year-end adjustment compute", () => {
  afterEach(() => {
    setTenantId("_fixture-books");
    const dir = join(getDataDir(), "finance", "year-end-adjustment");
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes a deterministic draft from payroll.yaml without e-file", () => {
    setTenantId("_fixture-books");
    const yea = computeYearEndAdjustment("FY2026");
    expect(yea.status).toBe("in_progress");
    expect(yea.employees.length).toBeGreaterThanOrEqual(1);
    expect(yea.employees[0]?.annual_gross_yen).toBe(280000 * 12);
    const summary = summarizeYearEndAdjustment(yea);
    expect(summary.employee_count).toBe(yea.employees.length);
    expect(summary.totals.annual_gross_yen).toBe(280000 * 12);
    expect(summary.note).toContain("提出はしない");
  });
});
