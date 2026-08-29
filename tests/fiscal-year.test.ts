import { describe, expect, it } from "vitest";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  fiscalYearStartMonth,
  resolveFiscalYear,
  resolveFiscalYearEndAsOf,
} from "../src/lib/finance/fiscal-year.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("fiscal year helpers", () => {
  it("resolves FY from end month and reference month", () => {
    expect(resolveFiscalYear(1, "2026-06")).toBe("FY2026");
    expect(resolveFiscalYear(1, "2027-01")).toBe("FY2026");
    expect(resolveFiscalYear(1, "2027-02")).toBe("FY2027");
  });

  it("uses company fiscal year end for GL as-of (fixture: January)", () => {
    useFinanceFixtureTenant();
    expect(fiscalYearEndDate("FY2026", 1)).toBe("2027-01-31");
    expect(fiscalYearStartMonth("FY2026", 1)).toBe("2026-02");
    expect(fiscalYearStartDate("FY2026", 1)).toBe("2026-02-01");
    expect(resolveFiscalYearEndAsOf("FY2026")).toBe("2027-01-31");
  });
});
