import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildComparativeBalanceSheet,
  resolvePriorAsOf,
} from "../src/lib/finance/ledger/comparative-statements.js";
import { loadOpeningBalances } from "../src/lib/finance/ledger/opening-balance.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("comparative statements", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("uses opening as_of as prior when cutover is after FY start", () => {
    useFinanceFixtureTenant();
    const opening = loadOpeningBalances();
    expect(opening?.as_of).toBe("2026-08-31");
    expect(resolvePriorAsOf({ fiscalYear: "FY2026" })).toBe("2026-08-31");
  });

  it("prior BS totals match opening balances at opening as_of", () => {
    useFinanceFixtureTenant();
    const opening = loadOpeningBalances()!;
    const cmp = buildComparativeBalanceSheet({
      asOf: "2026-08-31",
      fiscalYear: "FY2026",
      priorAsOf: opening.as_of,
    });
    expect(cmp.prior_as_of).toBe(opening.as_of);
    expect(cmp.prior.total_assets_yen).toBe(cmp.current.total_assets_yen);
    expect(cmp.total_assets_yen.delta).toBe(0);
  });
});
