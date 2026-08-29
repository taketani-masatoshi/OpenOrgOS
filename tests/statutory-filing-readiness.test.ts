import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import {
  payrollAccrualPaymentReadinessIssues,
  statutoryFilingReadinessIssues,
} from "../src/lib/finance/statutory-filing-readiness.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("statutory filing readiness", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("warns when payroll accrual exists without payment journal", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-PAYROLL-2026-09",
      occurred_at: "2026-09-25T00:00:00.000Z",
      description: "Payroll 2026-09",
      source: { kind: "payroll", period: "2026-09" },
      evidence_refs: ["test:payroll"],
      lines: [
        {
          account_code: "5300",
          debit_yen: 50000,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: "2140",
          debit_yen: 0,
          credit_yen: 45000,
          tax_category: "out_of_scope",
        },
        {
          account_code: "2120",
          debit_yen: 0,
          credit_yen: 5000,
          tax_category: "out_of_scope",
        },
      ],
    });
    const issues = payrollAccrualPaymentReadinessIssues({ asOf: "2026-09-30" });
    expect(
      issues.some((row) => row.message.includes("JE-PAYROLL-PAY-2026-09")),
    ).toBe(true);
  });

  it("returns structured statutory issues for fixture tenant", () => {
    useFinanceFixtureTenant();
    const issues = statutoryFilingReadinessIssues({ asOf: "2026-09-30" });
    expect(Array.isArray(issues)).toBe(true);
    for (const row of issues) {
      expect(["consumption_tax", "payroll", "remittance"]).toContain(row.domain);
      expect(["error", "warning"]).toContain(row.level);
    }
  });
});
