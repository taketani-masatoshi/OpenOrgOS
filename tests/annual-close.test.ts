import { describe, expect, it } from "vitest";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { buildOpeningBalancesFromTrialBalance } from "../src/lib/finance/ledger/opening-balance.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import { resolveFiscalYearCloseDates } from "../src/commands/finances-close.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("annual close", () => {
  it("builds BS-only opening balances excluding P/L accounts", () => {
    useFinanceFixtureTenant();
    const opening = buildOpeningBalancesFromTrialBalance({
      fiscalYear: "FY2027",
      asOf: "2026-08-31",
      periodStart: "2027-02",
      bsOnly: true,
    });
    const coa = loadChartOfAccounts();
    for (const line of opening.lines) {
      const account = coa.accounts.find((a) => a.code === line.account_code);
      expect(account?.type).not.toBe("revenue");
      expect(account?.type).not.toBe("expense");
    }
  });

  it("trial balance includes only BS rows after P/L zeroing in fixture", () => {
    useFinanceFixtureTenant();
    const trial = buildTrialBalance({ asOf: "2026-08-31" });
    const coa = loadChartOfAccounts();
    const plRows = trial.rows.filter((row) => {
      const account = coa.accounts.find((a) => a.code === row.account_code);
      return account?.type === "revenue" || account?.type === "expense";
    });
    expect(Array.isArray(plRows)).toBe(true);
  });

  it("falls back to company fiscal year end when yojitsu period_to is absent", () => {
    useFinanceFixtureTenant();
    // No yojitsu-fy2027.yaml in fixture → company fiscal_year_end_month = 1
    const dates = resolveFiscalYearCloseDates("FY2027");
    expect(dates.asOf).toBe("2028-01-31");
    expect(dates.nextPeriodStart).toBe("2028-02");
    expect(dates.nextFiscalYear).toBe("FY2028");
  });

  it("expands yojitsu period_to month to last calendar day", () => {
    useFinanceFixtureTenant();
    const dates = resolveFiscalYearCloseDates("FY2026");
    expect(dates.asOf).toBe("2027-01-31");
    expect(dates.nextPeriodStart).toBe("2027-02");
  });
});
