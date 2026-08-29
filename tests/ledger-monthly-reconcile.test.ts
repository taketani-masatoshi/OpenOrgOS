import { describe, expect, it, beforeEach } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { postDepreciationJournalEntries } from "../src/lib/finance/depreciation.js";
import { postMonthlyPlJournalEntries } from "../src/lib/finance/journal-sources.js";
import { buildMonthlyReconcileReport } from "../src/lib/finance/ledger/monthly-reconcile.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("ledger monthly reconcile", () => {
  beforeEach(() => {
    resetFixtureJournalEntries();
  });
  it("skips reconcile before period_start", () => {
    useFinanceFixtureTenant();
    const report = buildMonthlyReconcileReport({ month: "2026-08" });
    expect(report.gl_active).toBe(false);
    expect(report.balanced).toBe(true);
    expect(report.diffs).toEqual([]);
  });

  it("runs reconcile on or after period_start with gl_active=true", () => {
    useFinanceFixtureTenant();
    postDepreciationJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const report = buildMonthlyReconcileReport({ month: "2026-09" });
    expect(report.gl_active).toBe(true);
    expect(report.balanced).toBe(true);
    expect(report.diffs).toEqual([]);
  });

  it("prior-month journal does not affect current month period movement", () => {
    useFinanceFixtureTenant();
    postDepreciationJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const before = buildMonthlyReconcileReport({ month: "2026-09" });
    appendJournalEntry({
      entry_id: "JE-RECON-PRIOR-MONTH",
      occurred_at: "2026-08-15T00:00:00.000Z",
      description: "prior month noise",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:reconcile-prior"],
      lines: [
        { account_code: "4100", debit_yen: 0, credit_yen: 999_999, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 999_999, credit_yen: 0, tax_category: "out_of_scope" },
      ],
    });
    const after = buildMonthlyReconcileReport({ month: "2026-09" });
    expect(after.gl_active).toBe(true);
    expect(after.balanced).toBe(before.balanced);
    expect(after.diffs).toEqual(before.diffs);
  });

  it("reports diffs when monthly YAML and period journals disagree", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-RECON-MISMATCH",
      occurred_at: "2026-09-10T00:00:00.000Z",
      description: "partial revenue only",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:reconcile-mismatch"],
      lines: [
        { account_code: "4100", debit_yen: 0, credit_yen: 50_000, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 50_000, credit_yen: 0, tax_category: "out_of_scope" },
      ],
    });
    const report = buildMonthlyReconcileReport({ month: "2026-09" });
    expect(report.gl_active).toBe(true);
    expect(report.balanced).toBe(false);
    const rentDiff = report.diffs.find((d) => d.category === "rent");
    expect(rentDiff).toMatchObject({
      monthly_pl_yen: 100_000,
      trial_balance_yen: 50_000,
      delta_yen: 50_000,
    });
  });
});
