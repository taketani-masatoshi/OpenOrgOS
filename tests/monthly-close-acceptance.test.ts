import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runValidateReport } from "../src/commands/validate.js";
import { appendJournalEntry, loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { lastDayOfMonth } from "../src/lib/finance/fiscal-year.js";
import { reverseJournalEntry } from "../src/lib/finance/journal-reverse.js";
import { buildBalanceSheet } from "../src/lib/finance/ledger/balance-sheet.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { subsidiaryLedgerIntegrityIssues } from "../src/lib/finance/ledger/subsidiary-ledger.js";
import {
  closeAccountingMonth,
  evaluateMonthlyCloseGates,
} from "../src/lib/finance/monthly-close.js";
import { buildConsumptionTaxSummary } from "../src/lib/finance/consumption-tax.js";
import { isMonthLocked, loadPeriodLocks, unlockMonth } from "../src/lib/finance/period-lock.js";
import { buildMonthCloseChecklist } from "../src/lib/product/ledger-month-close-checklist.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

const MONTH = "2026-09";
const OPERATOR = "OP-TEST";

function bankPath(): string {
  return join(getDataDir(), "finance", "bank-statements.yaml");
}

function writeBank(yaml: string): void {
  writeFileSync(bankPath(), `${yaml.trim()}\n`, "utf-8");
}

function removeBank(): void {
  if (existsSync(bankPath())) unlinkSync(bankPath());
}

function manualEntry(input: {
  entryId: string;
  occurredAt: string;
  lines: Array<{
    account_code: string;
    debit_yen: number;
    credit_yen: number;
    tax_category: "out_of_scope" | "non_taxable";
    counterparty_id?: string;
  }>;
}): void {
  appendJournalEntry({
    entry_id: input.entryId,
    occurred_at: input.occurredAt,
    description: input.entryId,
    source: { kind: "manual", authorized_by: OPERATOR },
    evidence_refs: [`test:${input.entryId}`],
    lines: input.lines,
  });
}

describe("monthly close acceptance", () => {
  beforeEach(() => {
    resetFixtureJournalEntries();
    removeBank();
  });

  afterEach(() => {
    removeBank();
    resetFixtureJournalEntries();
  });

  it("closes 2026-09 when journals, statements, subsidiary and validate pass", () => {
    useFinanceFixtureTenant();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const asOf = lastDayOfMonth(MONTH);
    const first = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(first.ok).toBe(true);
    expect(first.evaluation.errors).toEqual([]);
    expect(first.locked).toBe(true);
    expect(isMonthLocked(MONTH)).toBe(true);

    const entries = loadJournalEntries().entries;
    expect(entries.some((entry) => entry.source?.kind === "depreciation")).toBe(true);
    expect(entries.some((entry) => entry.entry_id === `JE-PAYROLL-${MONTH}`)).toBe(true);
    expect(entries.some((entry) => entry.entry_id.startsWith(`JE-MPL-${MONTH}-`))).toBe(true);
    expect(buildTrialBalance({ asOf }).balanced).toBe(true);
    expect(buildBalanceSheet({ asOf, fiscalYear: "FY2026" }).balanced).toBe(true);
    expect(subsidiaryLedgerIntegrityIssues(asOf)).toEqual([]);
    expect(first.evaluation.items.find((item) => item.id === "bank-unmatched")?.pass).toBe(
      true,
    );
    expect(() => buildConsumptionTaxSummary({ period: MONTH })).not.toThrow();
    expect(() =>
      manualEntry({
        entryId: "JE-AFTER-LOCK",
        occurredAt: "2026-09-20T00:00:00.000Z",
        lines: [
          { account_code: "1100", debit_yen: 1, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "4100", debit_yen: 0, credit_yen: 1, tax_category: "non_taxable" },
        ],
      }),
    ).toThrow(/locked/);

    const validate = runValidateReport({ warnings: true });
    const glErrors = validate.issues.filter(
      (issue) =>
        issue.severity === "error" && issue.path.includes("data/finance/"),
    );
    expect(glErrors).toEqual([]);

    const count = loadJournalEntries().entries.length;
    const second = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(second.locked).toBe(true);
    expect(second.posted_entry_ids).toEqual([]);
    expect(loadJournalEntries().entries.length).toBe(count);

    const checklist = buildMonthCloseChecklist(MONTH);
    expect(checklist.ready).toBe(first.evaluation.can_lock);
    expect(checklist.checklist_complete).toBe(checklist.ready);
    expect(checklist.period_locked).toBe(true);
    expect(checklist.ready).toBe(true);
  });

  it("does not lock when the trial balance does not balance", () => {
    useFinanceFixtureTenant();
    manualEntry({
      entryId: "JE-UNKNOWN-ACCOUNT",
      occurredAt: "2026-09-15T00:00:00.000Z",
      lines: [
        { account_code: "9999", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" },
      ],
    });
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(false);
    expect(closed.ok).toBe(false);
    expect(closed.evaluation.errors.some((error) => error.startsWith("trial-balance"))).toBe(
      true,
    );
  });

  it("does not lock when the close month has unmatched bank rows", () => {
    useFinanceFixtureTenant();
    writeBank(`
entries:
  - id: BS-OPEN
    date: "2026-09-03"
    direction: inflow
    amount: 500
    status: unmatched
`);
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(false);
    expect(closed.evaluation.errors.some((error) => error.startsWith("bank-unmatched"))).toBe(
      true,
    );
  });

  it("locks when bank statements are absent", () => {
    useFinanceFixtureTenant();
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(existsSync(bankPath())).toBe(false);
    expect(closed.evaluation.items.find((item) => item.id === "bank-imported")?.level).toBe(
      "skip",
    );
    expect(closed.locked).toBe(true);
  });

  it("ignores unmatched bank rows that belong to a later month", () => {
    useFinanceFixtureTenant();
    writeBank(`
entries:
  - id: BS-NEXT
    date: "2026-10-02"
    direction: outflow
    amount: 800
    status: unmatched
`);
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.evaluation.errors.some((error) => error.startsWith("bank-unmatched"))).toBe(
      false,
    );
    expect(closed.locked).toBe(true);
  });

  it("locks when monthly YAML and journals differ, and records a warning", () => {
    useFinanceFixtureTenant();
    manualEntry({
      entryId: "JE-EXTRA-RENT",
      occurredAt: "2026-09-12T00:00:00.000Z",
      lines: [
        { account_code: "1100", debit_yen: 1000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 1000, tax_category: "non_taxable" },
      ],
    });
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.evaluation.warnings.some((warning) => warning.startsWith("monthly-reconcile"))).toBe(
      true,
    );
    expect(closed.locked).toBe(true);
  });

  it("does not lock when a control account has an unassigned balance", () => {
    useFinanceFixtureTenant();
    manualEntry({
      entryId: "JE-UNASSIGNED-AR",
      occurredAt: "2026-09-11T00:00:00.000Z",
      lines: [
        { account_code: "1150", debit_yen: 500, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 500, tax_category: "non_taxable" },
      ],
    });
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(false);
    expect(closed.evaluation.errors.some((error) => error.startsWith("subsidiary"))).toBe(true);
  });

  it("corrects a locked month only after a reasoned unlock, then re-locks", () => {
    useFinanceFixtureTenant();
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(true);
    const original = loadJournalEntries().entries[0]!;
    const reversal = reverseJournalEntry({
      entryId: original.entry_id,
      occurredAt: "2026-09-20T00:00:00.000Z",
      authorizedBy: OPERATOR,
      reversalEntryId: `${original.entry_id}-REV`,
    });
    expect(() => appendJournalEntry(reversal)).toThrow(/locked/);
    expect(() =>
      manualEntry({
        entryId: "JE-LOCKED-MANUAL",
        occurredAt: "2026-09-21T00:00:00.000Z",
        lines: [
          { account_code: "1100", debit_yen: 2, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "4100", debit_yen: 0, credit_yen: 2, tax_category: "non_taxable" },
        ],
      }),
    ).toThrow(/locked/);
    expect(() => unlockMonth({ month: MONTH, unlockedBy: OPERATOR, reason: " " })).toThrow(
      /reason/,
    );

    unlockMonth({
      month: MONTH,
      unlockedBy: OPERATOR,
      reason: "correct depreciation",
    });
    appendJournalEntry(reversal);
    const count = loadJournalEntries().entries.length;
    const relocked = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(relocked.locked).toBe(true);
    expect(loadJournalEntries().entries.length).toBe(count);
    expect(() =>
      manualEntry({
        entryId: "JE-AFTER-RELOCK",
        occurredAt: "2026-09-22T00:00:00.000Z",
        lines: [
          { account_code: "1100", debit_yen: 3, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "4100", debit_yen: 0, credit_yen: 3, tax_category: "non_taxable" },
        ],
      }),
    ).toThrow(/locked/);

    const locks = loadPeriodLocks().locks.filter((row) => row.month === MONTH);
    expect(locks.map((row) => row.status)).toEqual(["locked", "unlocked", "locked"]);
  });

  it("keeps an existing lock when a later gate failure is found", () => {
    useFinanceFixtureTenant();
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(true);
    writeBank(`
entries:
  - id: BS-LATE
    date: "2026-09-18"
    direction: inflow
    amount: 900
    status: unmatched
`);
    const again = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(again.ok).toBe(false);
    expect(again.locked).toBe(true);
    expect(isMonthLocked(MONTH)).toBe(true);
    expect(again.posted_entry_ids).toEqual([]);
    const gates = evaluateMonthlyCloseGates(MONTH);
    expect(gates.can_lock).toBe(false);
    expect(buildMonthCloseChecklist(MONTH).ready).toBe(false);
    expect(buildMonthCloseChecklist(MONTH).period_locked).toBe(true);
  });
});
