import { describe, expect, it, beforeEach } from "vitest";
import { loadChartOfAccounts } from "../src/lib/data.js";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { buildCashFlowStatement } from "../src/lib/finance/ledger/cash-flow-statement.js";
import {
  applyFixtureStatementRoles,
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("cash flow statement", () => {
  beforeEach(() => {
    applyFixtureStatementRoles();
  });
  it("builds indirect CF for fixture tenant", () => {
    useFinanceFixtureTenant();
    const report = buildCashFlowStatement({ asOf: "2026-08-31", fiscalYear: "FY2026" });
    expect(report.method).toBe("indirect");
    expect(report.operating.length).toBeGreaterThan(0);
    expect(report.cash_end_yen).toBeGreaterThan(0);
  });

  it("marks cash flow incomplete when an untagged balance moves", () => {
    resetFixtureJournalEntries();
    const coa = structuredClone(loadChartOfAccounts());
    const receivable = coa.accounts.find((account) => account.code === "1150");
    if (receivable) delete receivable.cf_role;
    appendJournalEntry({
      entry_id: "JE-CF-UNTAGGED",
      occurred_at: "2026-09-12T00:00:00.000Z",
      description: "untagged",
      source: { kind: "manual", authorized_by: "OP-TEST" },
      evidence_refs: ["test:cf"],
      lines: [
        { account_code: "1150", debit_yen: 20, credit_yen: 0, tax_category: "out_of_scope", counterparty_id: "PROP-CF" },
        { account_code: "4100", debit_yen: 0, credit_yen: 20, tax_category: "non_taxable" },
      ],
    });
    const report = buildCashFlowStatement({
      asOf: "2026-09-30",
      fiscalYear: "FY2026",
      coa,
    });
    expect(report.issues.some((issue) => issue.includes("1150"))).toBe(true);
    resetFixtureJournalEntries();
  });
});
