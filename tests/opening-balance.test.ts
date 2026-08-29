import { describe, expect, it } from "vitest";
import { buildOpeningBalancesFromTrialBalance } from "../src/lib/finance/ledger/opening-balance.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("opening balance from trial balance", () => {
  it("produces balanced lines from trial balance", () => {
    useFinanceFixtureTenant();
    const file = buildOpeningBalancesFromTrialBalance({
      fiscalYear: "FY2027",
      asOf: "2027-01-31",
      periodStart: "2027-02",
    });
    const debit = file.lines.reduce((s, l) => s + l.debit_yen, 0);
    const credit = file.lines.reduce((s, l) => s + l.credit_yen, 0);
    expect(debit).toBe(credit);
    expect(file.fiscal_year).toBe("FY2027");
  });
});
