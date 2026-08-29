import { describe, expect, it, beforeEach } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("ledger trial balance", () => {
  beforeEach(() => resetFixtureJournalEntries());
  it("balances a simple manual journal pair", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-TEST-TRIAL-001",
      occurred_at: "2026-07-01T00:00:00.000Z",
      description: "test trial balance",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:trial-balance"],
      lines: [
        { account_code: "5300", debit_yen: 1000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 1000, tax_category: "out_of_scope" },
      ],
    });
    const report = buildTrialBalance({ asOf: "2026-07-31" });
    expect(report.balanced).toBe(true);
    expect(report.debit_total_yen).toBeGreaterThanOrEqual(1000);
  });

  it("does not include opening balances before opening.as_of", () => {
    useFinanceFixtureTenant();
    const report = buildTrialBalance({ asOf: "2026-08-15" });
    expect(report.rows.find((row) => row.account_code === "1100")).toBeUndefined();
  });

  it("includes opening and post-cutover journals after opening.as_of", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-POST-CUTOVER-001",
      occurred_at: "2026-09-05T00:00:00.000Z",
      description: "post cutover",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:cutover"],
      lines: [
        { account_code: "1100", debit_yen: 500, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "3200", debit_yen: 0, credit_yen: 500, tax_category: "out_of_scope" },
      ],
    });
    // Same-day as opening.as_of must not double-count into opening window.
    appendJournalEntry({
      entry_id: "JE-ON-CUTOVER-001",
      occurred_at: "2026-08-31T12:00:00.000Z",
      description: "on cutover day",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:cutover-day"],
      lines: [
        { account_code: "1100", debit_yen: 999, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "3200", debit_yen: 0, credit_yen: 999, tax_category: "out_of_scope" },
      ],
    });
    const report = buildTrialBalance({ asOf: "2026-09-30" });
    expect(report.rows.find((row) => row.account_code === "1100")?.balance_yen).toBe(1_000_500);
  });
});
