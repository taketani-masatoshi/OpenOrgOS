import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  postPayrollJournalEntry,
  postRemittanceJournalEntry,
} from "../src/lib/finance/journal-sources.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("remittance journals", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("clears withholding payable against cash", () => {
    useFinanceFixtureTenant();
    postPayrollJournalEntry({
      period: "2026-09",
      authorizedBy: "OP-TEST",
      grossYen: 100000,
      withholdingYen: 10000,
      socialEmployerYen: 15000,
    });
    const posted = postRemittanceJournalEntry({
      period: "2026-09",
      obligation: "withholding",
      authorizedBy: "OP-TEST",
    });
    expect(posted).toBe("JE-REMIT-WITHHOLDING-2026-09");
    const trial = buildTrialBalance({ asOf: "2026-09-30" });
    expect(trial.rows.find((row) => row.account_code === "2120")?.balance_yen ?? 0).toBeCloseTo(0);
  });
});
