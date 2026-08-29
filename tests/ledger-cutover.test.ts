import { describe, expect, it } from "vitest";
import {
  buildMonthlyReconcileReport,
  monthlyReconcileIntegrityIssues,
} from "../src/lib/finance/ledger/monthly-reconcile.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("ledger GL cutover", () => {
  it("skips reconcile before period_start", () => {
    useFinanceFixtureTenant();
    const report = buildMonthlyReconcileReport({ month: "2026-08" });
    expect(report.gl_active).toBe(false);
    expect(report.diffs).toEqual([]);
    expect(monthlyReconcileIntegrityIssues("2026-08")).toEqual([]);
  });

  it("runs reconcile on or after period_start", () => {
    useFinanceFixtureTenant();
    const report = buildMonthlyReconcileReport({ month: "2026-09" });
    expect(report.gl_active).toBe(true);
    expect(Array.isArray(report.diffs)).toBe(true);
  });
});
