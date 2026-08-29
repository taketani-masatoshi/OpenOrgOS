import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { setTenantId } from "../src/lib/tenant.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("journal write guard", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());
  it("blocks vitest writes to non-fixture tenants", () => {
    setTenantId("mal");
    expect(() =>
      appendJournalEntry({
        entry_id: "JE-GUARD-BLOCK-001",
        occurred_at: "2026-09-01T00:00:00.000Z",
        description: "should be blocked",
        source: { kind: "manual", authorized_by: "test" },
        evidence_refs: ["test:guard"],
        lines: [
          { account_code: "1100", debit_yen: 1, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "3200", debit_yen: 0, credit_yen: 1, tax_category: "out_of_scope" },
        ],
      }),
    ).toThrow(/fixture tenants/);
  });

  it("allows vitest writes to fixture tenant", () => {
    useFinanceFixtureTenant();
    expect(() =>
      appendJournalEntry({
        entry_id: "JE-GUARD-ALLOW-001",
        occurred_at: "2026-09-01T00:00:00.000Z",
        description: "fixture ok",
        source: { kind: "manual", authorized_by: "test" },
        evidence_refs: ["test:guard"],
        lines: [
          { account_code: "1100", debit_yen: 1, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "3200", debit_yen: 0, credit_yen: 1, tax_category: "out_of_scope" },
        ],
      }),
    ).not.toThrow();
  });
});
