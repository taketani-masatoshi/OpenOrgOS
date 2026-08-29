import { describe, expect, it, beforeEach } from "vitest";
import { postDepreciationJournalEntries } from "../src/lib/finance/depreciation.js";
import { postMonthlyPlJournalEntries } from "../src/lib/finance/journal-sources.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { buildMonthlyReconcileReport } from "../src/lib/finance/ledger/monthly-reconcile.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("monthly P/L journal posting", () => {
  beforeEach(() => resetFixtureJournalEntries());
  it("2026-09 reconcile balanced after depreciation + monthly-pl", () => {
    useFinanceFixtureTenant();
    postDepreciationJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const report = buildMonthlyReconcileReport({ month: "2026-09" });
    expect(report.gl_active).toBe(true);
    expect(report.balanced).toBe(true);
    expect(report.diffs).toEqual([]);
  });

  it("depreciation idempotent re-run keeps 5100 at single month amount", () => {
    useFinanceFixtureTenant();
    // Post after cutover (opening.as_of=2026-08-31) so TB includes the journal.
    postDepreciationJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    postDepreciationJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const trial = buildTrialBalance({ asOf: "2026-09-30" });
    const dep5100 = trial.rows.find((row) => row.account_code === "5100");
    expect(dep5100?.balance_yen).toBe(8865);
  });

  it("posts revenue to AR and expenses to AP with property counterparties", () => {
    useFinanceFixtureTenant();
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const rent = loadJournalEntries().entries.find((e) => e.entry_id === "JE-MPL-2026-09-REV-RENT");
    const hotel = loadJournalEntries().entries.find(
      (e) => e.entry_id === "JE-MPL-2026-09-REV-HOTEL-REVENUE",
    );
    const opex = loadJournalEntries().entries.find(
      (e) => e.entry_id === "JE-MPL-2026-09-EXP-OTHER-PROPERTY",
    );
    expect(rent?.lines.some((l) => l.account_code === "1150" && l.counterparty_id === "PROP-001")).toBe(
      true,
    );
    expect(hotel?.lines.some((l) => l.account_code === "1100")).toBe(false);
    expect(opex?.lines.some((l) => l.account_code === "2110" && l.counterparty_id === "PROP-002")).toBe(
      true,
    );
  });
});
