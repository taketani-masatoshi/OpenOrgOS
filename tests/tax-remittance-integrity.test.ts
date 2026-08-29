import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { postRemittanceJournalEntry } from "../src/lib/finance/journal-sources.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { remittanceIntegrityIssues } from "../src/lib/finance/remittance-integrity.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("tax remittance integrity", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("consumption tax payable zeros after remittance", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-TAX-PAY-001",
      occurred_at: "2026-09-05T00:00:00.000Z",
      description: "sales tax",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:tax-pay"],
      lines: [
        {
          account_code: "1100",
          debit_yen: 11000,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: "4100",
          debit_yen: 0,
          credit_yen: 10000,
          tax_category: "taxable_10",
        },
        {
          account_code: "2160",
          debit_yen: 0,
          credit_yen: 1000,
          tax_category: "out_of_scope",
        },
      ],
    });
    const before =
      buildTrialBalance({ asOf: "2026-09-30" }).rows.find(
        (r) => r.account_code === "2160",
      )?.balance_yen ?? 0;
    expect(Math.abs(before)).toBe(1000);
    postRemittanceJournalEntry({
      period: "2026-09",
      obligation: "consumption_tax",
      authorizedBy: "OP-TEST",
      occurredAt: "2026-09-20T00:00:00.000Z",
    });
    const after =
      buildTrialBalance({ asOf: "2026-09-30" }).rows.find(
        (r) => r.account_code === "2160",
      )?.balance_yen ?? 0;
    expect(Math.abs(after)).toBe(0);
  });

  it("remittanceIntegrityIssues returns an array", () => {
    useFinanceFixtureTenant();
    const issues = remittanceIntegrityIssues({ asOf: "2026-12-31" });
    expect(Array.isArray(issues)).toBe(true);
  });
});
