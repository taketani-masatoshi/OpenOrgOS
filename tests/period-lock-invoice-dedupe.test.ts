import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  lockMonth,
  loadPeriodLocks,
  unlockMonth,
  resetPeriodLocksForTests,
  savePeriodLocks,
} from "../src/lib/finance/period-lock.js";
import {
  postMonthlyPlJournalEntries,
  postSalesInvoiceJournalEntry,
} from "../src/lib/finance/journal-sources.js";
import {
  appendJournalEntry,
  loadJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import { invoiceMplDuplicateIssues } from "../src/lib/finance/ledger/invoice-mpl-dedupe.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("period-locks append-only", () => {
  beforeEach(() => {
    useFinanceFixtureTenant();
    resetPeriodLocksForTests();
  });
  afterEach(() => {
    resetPeriodLocksForTests();
  });

  it("rejects mutation of historical lock rows", () => {
    lockMonth({ month: "2026-09", lockedBy: "OP-TEST" });
    const file = loadPeriodLocks();
    expect(file.locks).toHaveLength(1);
    file.locks[0]!.by = "TAMPERED";
    expect(() => savePeriodLocks(file)).toThrow(/append-only/);
  });

  it("allows unlock as append", () => {
    lockMonth({ month: "2026-09", lockedBy: "OP-TEST" });
    unlockMonth({ month: "2026-09", unlockedBy: "OP-TEST", reason: "fix" });
    expect(loadPeriodLocks().locks).toHaveLength(2);
  });
});

describe("invoice vs JE-MPL dedupe", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("skips invoice JE when monthly PL already posted for the same property", () => {
    useFinanceFixtureTenant();
    const posted = postMonthlyPlJournalEntries({
      period: "2026-09",
      authorizedBy: "OP-TEST",
    });
    expect(posted.length).toBeGreaterThan(0);
    const skipped = postSalesInvoiceJournalEntry({
      invoiceId: "PROP-001-2026-09",
      amountYen: 110000,
      propertyId: "PROP-001",
      occurredAt: "2026-09-01T00:00:00.000Z",
      authorizedBy: "test",
    });
    expect(skipped).toBeNull();
    expect(
      loadJournalEntries().entries.some((e) => e.entry_id.startsWith("JE-INV-")),
    ).toBe(false);
  });

  it("allows invoice JE for another property when only one property has JE-MPL", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-MPL-2026-09-REV-RENT",
      occurred_at: "2026-09-28T12:00:00.000Z",
      description: "Monthly P/L revenue rent 2026-09",
      source: {
        kind: "closing",
        period: "2026-09",
        adjustment_id: "monthly-pl-rev-rent",
      },
      evidence_refs: ["monthly:2026-09"],
      lines: [
        {
          account_code: "1150",
          debit_yen: 100000,
          credit_yen: 0,
          tax_category: "out_of_scope",
          counterparty_id: "PROP-001",
        },
        {
          account_code: "4100",
          debit_yen: 0,
          credit_yen: 100000,
          tax_category: "taxable_10",
        },
      ],
    });
    const posted = postSalesInvoiceJournalEntry({
      invoiceId: "PROP-002-2026-09",
      amountYen: 110000,
      propertyId: "PROP-002",
      occurredAt: "2026-09-01T00:00:00.000Z",
      authorizedBy: "test",
    });
    expect(posted).toBe("JE-INV-PROP-002-2026-09");
  });

  it("posts invoice JE on invoice-only months without JE-MPL", () => {
    useFinanceFixtureTenant();
    const posted = postSalesInvoiceJournalEntry({
      invoiceId: "PROP-001-2026-09",
      amountYen: 110000,
      propertyId: "PROP-001",
      occurredAt: "2026-09-01T00:00:00.000Z",
      authorizedBy: "test",
    });
    expect(posted).toBe("JE-INV-PROP-001-2026-09");
  });

  it("flags duplicate JE-INV and JE-MPL for the same property/month", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-MPL-2026-09-REV-RENT",
      occurred_at: "2026-09-28T12:00:00.000Z",
      description: "Monthly P/L revenue rent 2026-09",
      source: {
        kind: "closing",
        period: "2026-09",
        adjustment_id: "monthly-pl-rev-rent",
      },
      evidence_refs: ["monthly:2026-09"],
      lines: [
        {
          account_code: "1150",
          debit_yen: 100000,
          credit_yen: 0,
          tax_category: "out_of_scope",
          counterparty_id: "PROP-001",
        },
        {
          account_code: "4100",
          debit_yen: 0,
          credit_yen: 100000,
          tax_category: "taxable_10",
        },
      ],
    });
    appendJournalEntry({
      entry_id: "JE-INV-PROP-001-2026-09",
      occurred_at: "2026-09-01T00:00:00.000Z",
      description: "legacy duplicate invoice",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:dup"],
      lines: [
        {
          account_code: "1150",
          debit_yen: 110000,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: "4100",
          debit_yen: 0,
          credit_yen: 110000,
          tax_category: "taxable_10",
        },
      ],
    });
    const dupes = invoiceMplDuplicateIssues();
    expect(dupes.some((row) => row.message.includes("PROP-001"))).toBe(true);
  });
});
