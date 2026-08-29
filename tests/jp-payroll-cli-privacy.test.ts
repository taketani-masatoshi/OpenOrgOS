import { describe, expect, it } from "vitest";
import { loadPayroll } from "../src/lib/data.js";
import { computePayrollMonth } from "../src/lib/finance/payroll-jp.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("jp_payroll CLI privacy", () => {
  it("does not include personal names or bank account numbers in payroll summary", () => {
    setTenantId("mal");
    const payroll = loadPayroll();
    const gross = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
    const result = computePayrollMonth({ month: "2026-09", grossYen: gross });
    const output = JSON.stringify(result);
    for (const officer of payroll.officers ?? []) {
      expect(output).not.toContain(officer.name);
    }
    expect(output).not.toMatch(/BANK-|口座/);
    expect(result.gross_yen).toBeGreaterThan(0);
  });
});
