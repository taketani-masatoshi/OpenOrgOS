import { describe, expect, it } from "vitest";
import { appendJournalEntry, loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import {
  abortMonthlyClosePosts,
  allocateCloseEntryId,
  beginMonthlyCloseTransaction,
  closeAbortReversalId,
  isClosePostAborted,
  markMonthlyCloseCommitted,
  markMonthlyClosePosted,
} from "../src/lib/finance/monthly-close-transaction.js";
import { lockMonth } from "../src/lib/finance/period-lock.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("monthly close transaction abort", () => {
  it("reverses newly posted close journals with a stable -ABORT id", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    appendJournalEntry(
      {
        entry_id: "JE-CLOSE-ABORT-DEMO",
        occurred_at: "2026-09-30T12:00:00.000Z",
        description: "demo close post",
        source: { kind: "closing", period: "2026-09", adjustment_id: "demo" },
        evidence_refs: ["test:demo"],
        lines: [
          { account_code: "5100", debit_yen: 10, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "2100", debit_yen: 0, credit_yen: 10, tax_category: "out_of_scope" },
        ],
      },
      { postedBy: "OP-TEST" },
    );
    const abortIds = abortMonthlyClosePosts({
      entryIds: ["JE-CLOSE-ABORT-DEMO"],
      operatorId: "OP-TEST",
      occurredAt: "2026-09-30T23:59:59.000Z",
    });
    expect(abortIds).toEqual([closeAbortReversalId("JE-CLOSE-ABORT-DEMO")]);
    expect(isClosePostAborted("JE-CLOSE-ABORT-DEMO")).toBe(true);
    const again = abortMonthlyClosePosts({
      entryIds: ["JE-CLOSE-ABORT-DEMO"],
      operatorId: "OP-TEST",
      occurredAt: "2026-09-30T23:59:59.000Z",
    });
    expect(again).toEqual(abortIds);
    expect(
      loadJournalEntries().entries.filter((entry) => entry.reversal_of === "JE-CLOSE-ABORT-DEMO"),
    ).toHaveLength(1);
  });

  it("allocates -R{n} after abort so close can be retried", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const base = "JE-PAYROLL-2026-09";
    appendJournalEntry(
      {
        entry_id: base,
        occurred_at: "2026-09-25T00:00:00.000Z",
        description: "payroll",
        source: { kind: "payroll", period: "2026-09" },
        evidence_refs: ["payroll:2026-09"],
        lines: [
          { account_code: "5100", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "2100", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" },
        ],
      },
      { postedBy: "OP-TEST" },
    );
    abortMonthlyClosePosts({
      entryIds: [base],
      operatorId: "OP-TEST",
      occurredAt: "2026-09-30T23:59:59.000Z",
    });
    expect(allocateCloseEntryId(base)).toBe(`${base}-R1`);
  });

  it("repairs posted state to committed when month is already locked", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    let state = beginMonthlyCloseTransaction({ month: "2026-09", operatorId: "OP-TEST" });
    state = markMonthlyClosePosted(state, ["JE-DEMO"]);
    lockMonth({
      month: "2026-09",
      lockedBy: "OP-TEST",
      reason: "finances close",
      evidence: {
        version: 1,
        algorithm: "sha256",
        journal_entries_sha256: "a".repeat(64),
        bank_reconciliation_sha256: "b".repeat(64),
        trial_balance_sha256: "c".repeat(64),
        gate_results_sha256: "d".repeat(64),
        operator_id: "OP-TEST",
        can_lock: true,
        gate_results: [],
      },
    });
    const resumed = beginMonthlyCloseTransaction({ month: "2026-09", operatorId: "OP-TEST" });
    expect(resumed.phase).toBe("committed");
    expect(markMonthlyCloseCommitted(state).phase).toBe("committed");
  });
});
