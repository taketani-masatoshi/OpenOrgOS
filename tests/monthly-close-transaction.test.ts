import { describe, expect, it } from "vitest";
import { appendJournalEntry, loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import {
  abortMonthlyClosePosts,
  closeAbortReversalId,
  isClosePostAborted,
} from "../src/lib/finance/monthly-close-transaction.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("monthly close transaction abort", () => {
  it("reverses newly posted close journals with a stable -ABORT id", () => {
    useFinanceFixtureTenant();
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
});
