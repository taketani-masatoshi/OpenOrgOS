import { describe, expect, it } from "vitest";
import { buildCashFlowStatement } from "../src/lib/finance/ledger/cash-flow-statement.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("cash flow statement", () => {
  it("builds indirect CF for fixture tenant", () => {
    useFinanceFixtureTenant();
    const report = buildCashFlowStatement({ asOf: "2026-08-31", fiscalYear: "FY2026" });
    expect(report.method).toBe("indirect");
    expect(report.operating.length).toBeGreaterThan(0);
    expect(report.cash_end_yen).toBeGreaterThan(0);
  });
});
