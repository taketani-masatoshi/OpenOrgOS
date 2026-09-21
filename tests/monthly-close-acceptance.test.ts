import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import YAML from "yaml";
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
  monthlyCloseTransactionPath,
} from "../src/lib/finance/monthly-close.js";
import { buildConsumptionTaxSummary } from "../src/lib/finance/consumption-tax.js";
import { isMonthLocked, loadPeriodLocks, lockMonth, unlockMonth } from "../src/lib/finance/period-lock.js";
import { buildMonthCloseChecklist } from "../src/lib/product/ledger-month-close-checklist.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  applyFixtureStatementRoles,
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

const MONTH = "2026-09";
const OPERATOR = "OP-TEST";

function bankPath(): string {
  return join(getDataDir(), "finance", "bank-statements.yaml");
}

function writeBank(yaml: string): void {
  let raw: { entries: Array<{ id: string; direction: "inflow" | "outflow"; amount: number; date: string; status?: string }> };
  try { raw = YAML.parse(yaml) as typeof raw; } catch { writeFileSync(bankPath(), yaml, "utf-8"); return; }
  const entries = raw.entries.map((entry) => ({ ...entry, category: "fixture", description: entry.id,
    account_id: "BANK-001", chart_account_id: "1100", source: "import" }));
  const months = [...new Set(entries.map((entry) => entry.date.slice(0, 7)))].sort();
  const batches = months.map((month) => {
    const asOf = lastDayOfMonth(month);
    const monthEntries = entries.filter((entry) => entry.date.slice(0, 7) === month);
    const movement = monthEntries.reduce((sum, entry) => sum + (entry.direction === "inflow" ? entry.amount : -entry.amount), 0);
    const closing = buildTrialBalance({ asOf }).rows.find((row) => row.account_code === "1100")?.balance_yen ?? 0;
    return { id: `BATCH-${month}`, fingerprint: "a".repeat(64), imported_at: `${asOf}T00:00:00.000Z`, adapter: "fixture",
      account_id: "BANK-001", period_start: `${month}-01`, period_end: asOf,
      opening_balance: closing - movement, closing_balance: closing, entry_ids: monthEntries.map((entry) => entry.id) };
  });
  writeFileSync(bankPath(), YAML.stringify({
    as_of: batches.at(-1)?.period_end ?? lastDayOfMonth(MONTH),
    import_batches: batches,
    entries,
  }), "utf-8");
}

function removeBank(): void {
  if (existsSync(bankPath())) unlinkSync(bankPath());
}

function lockPrior(): void {
  lockMonth({ month: "2026-08", lockedBy: OPERATOR, reason: "prior month" });
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
    applyFixtureStatementRoles();
    removeBank();
  });

  afterEach(() => {
    removeBank();
    resetFixtureJournalEntries();
  });

  it("closes 2026-09 when journals, statements, subsidiary and validate pass", () => {
    useFinanceFixtureTenant();
    lockPrior();
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

  it("takes over an expired monthly-close lease and safely resumes", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    writeFileSync(monthlyCloseTransactionPath(MONTH), [
      "version: 1", `month: ${MONTH}`, "operator_id: OP-DEAD", "phase: posting",
      "posted_entry_ids: []", 'lease_expires_at: "2020-01-01T00:00:00.000Z"',
      'updated_at: "2020-01-01T00:00:00.000Z"', "",
    ].join("\n"));
    const resumed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(resumed.ok).toBe(true);
    expect(resumed.locked).toBe(true);
    expect(loadJournalEntries().entries.map((entry) => entry.entry_id).length).toBeGreaterThan(0);
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
    expect(closed.evaluation.errors.some((error) => error.startsWith("trial-balance"))).toBe(true);
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

  it("refuses to skip bank reconciliation when a bank account is configured", () => {
    useFinanceFixtureTenant();
    lockPrior();
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(existsSync(bankPath())).toBe(false);
    expect(closed.evaluation.items.find((item) => item.id === "bank-imported")).toMatchObject({
      pass: false,
      level: "error",
    });
    expect(closed.locked).toBe(false);
  });

  it("skips bank reconciliation only when no bank account is configured", () => {
    useFinanceFixtureTenant();
    lockPrior();
    const cashPath = join(getDataDir(), "finance", "cash-balance.yaml");
    const original = readFileSync(cashPath, "utf-8");
    writeFileSync(cashPath, 'as_of: "2026-09-30"\nstatus: confirmed\ncurrency: JPY\naccounts: []\ntotal: 0\n');
    try {
      const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
      expect(closed.evaluation.items.find((item) => item.id === "bank-imported")).toMatchObject({
        pass: true,
        level: "skip",
      });
      expect(closed.locked).toBe(true);
      expect(loadPeriodLocks().locks.at(-1)?.evidence).toMatchObject({
        version: 1,
        algorithm: "sha256",
        can_lock: true,
      });
    } finally {
      writeFileSync(cashPath, original);
    }
  });

  it("refuses lock when the bank statement file cannot be read", () => {
    useFinanceFixtureTenant();
    writeBank("entries: [broken");
    const evaluation = evaluateMonthlyCloseGates(MONTH);
    const imported = evaluation.items.find((item) => item.id === "bank-imported");
    expect(imported?.pass).toBe(false);
    expect(imported?.level).toBe("error");
    expect(evaluation.can_lock).toBe(false);
  });

  it("ignores unmatched bank rows that belong to a later month", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-THIS
    date: "2026-09-04"
    direction: inflow
    amount: 100
    status: matched
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

  it("warns but locks when monthly YAML and journals differ", () => {
    useFinanceFixtureTenant();
    lockPrior();
    manualEntry({
      entryId: "JE-EXTRA-RENT",
      occurredAt: "2026-09-12T00:00:00.000Z",
      lines: [
        { account_code: "1100", debit_yen: 1000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 1000, tax_category: "non_taxable" },
      ],
    });
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.evaluation.warnings.some((warning) => warning.startsWith("monthly-reconcile"))).toBe(
      true,
    );
    expect(closed.evaluation.errors.some((error) => error.startsWith("monthly-reconcile"))).toBe(false);
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
    lockPrior();
    manualEntry({
      entryId: "JE-BS-ONLY",
      occurredAt: "2026-09-11T00:00:00.000Z",
      lines: [
        { account_code: "1100", debit_yen: 2, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1300", debit_yen: 0, credit_yen: 2, tax_category: "out_of_scope" },
      ],
    });
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(true);
    const reversal = reverseJournalEntry({
      entryId: "JE-BS-ONLY",
      occurredAt: "2026-09-20T00:00:00.000Z",
      authorizedBy: OPERATOR,
      reversalEntryId: "JE-BS-ONLY-REV",
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
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
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
    lockPrior();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
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

  it("does not lock the next month when the previous month is unlocked", () => {
    useFinanceFixtureTenant();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.evaluation.errors.some((error) => error.startsWith("prior-month-locked"))).toBe(
      true,
    );
    expect(closed.locked).toBe(false);
  });

  it("does not lock when a revenue line has no tax category", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    appendJournalEntry({
      entry_id: "JE-NO-TAX",
      occurred_at: "2026-09-12T00:00:00.000Z",
      description: "missing category",
      claim_id: "ECL-20260912-001",
      event: "expense_claim_posted",
      evidence_refs: ["test:no-tax"],
      lines: [
        { account_code: "1100", debit_yen: 50, credit_yen: 0 },
        { account_code: "4100", debit_yen: 0, credit_yen: 50 },
      ],
    });
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.evaluation.errors.some((error) => error.startsWith("consumption-tax"))).toBe(true);
    expect(closed.locked).toBe(false);
  });

  it("posts a specified accrual and ignores a zero adjustment", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const chartPath = join(getDataDir(), "finance", "chart-of-accounts.yaml");
    const original = readFileSync(chartPath, "utf-8");
    writeFileSync(
      chartPath,
      `${original}\nmonthly_close_adjustments:\n  - trigger: accrual\n    debit: "5900"\n    credit: "2140"\n    amount_source: "accrual 4000"\n  - trigger: ignored\n    debit: "5900"\n    credit: "2140"\n    amount_source: "accrual 0"\n`,
    );
    try {
      const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
      expect(closed.evaluation.errors).toEqual([]);
      const ids = loadJournalEntries().entries.map((entry) => entry.entry_id);
      expect(ids).toContain("JE-CLOSE-2026-09-ACCRUAL");
      expect(ids).not.toContain("JE-CLOSE-2026-09-IGNORED");
    } finally {
      writeFileSync(chartPath, original);
    }
  });

  it("does not lock when inventory does not match the books", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const inventoryPath = join(getDataDir(), "finance", "inventory.yaml");
    writeFileSync(
      inventoryPath,
      `months:\n  - month: "2026-09"\n    account_code: "1100"\n    ending_inventory_yen: 1\n    cogs_account_code: "5100"\n    cogs_yen: 999999\n`,
    );
    try {
      const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
      expect(closed.evaluation.errors.some((error) => error.startsWith("inventory-cogs"))).toBe(
        true,
      );
      expect(closed.locked).toBe(false);
    } finally {
      unlinkSync(inventoryPath);
    }
  });

  it("does not post monthly depreciation for a small-amount asset", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const assetPath = join(getDataDir(), "finance", "fixed-assets.yaml");
    const original = readFileSync(assetPath, "utf-8");
    writeFileSync(assetPath, original.replace("id: ASSET-001\n", "id: ASSET-001\n    small_amount: true\n"));
    try {
      closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
      expect(
        loadJournalEntries().entries.some((entry) => entry.entry_id.includes("ASSET-001")),
      ).toBe(false);
    } finally {
      writeFileSync(assetPath, original);
    }
  });

  it("warns but locks when the month has no monthly plan", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
  - id: BS-2026-10-1
    date: "2026-10-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const september = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(september.locked).toBe(true);
    const october = closeAccountingMonth({ month: "2026-10", operatorId: OPERATOR });
    expect(october.evaluation.warnings.some((warning) => warning.includes("monthly plan not imported"))).toBe(
      true,
    );
    expect(october.evaluation.errors.some((error) => error.includes("monthly plan not imported"))).toBe(false);
    expect(october.locked).toBe(true);
  });

  it("carries the locked month balance into the next month", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-2026-09-1
    date: "2026-09-10"
    direction: inflow
    amount: 1000
    status: matched
`);
    const september = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(september.locked).toBe(true);
    const asOf = lastDayOfMonth(MONTH);
    const before = buildTrialBalance({ asOf }).rows.find((row) => row.account_code === "1100")
      ?.balance_yen;
    appendJournalEntry({
      entry_id: "JE-OCT-CASH",
      occurred_at: "2026-10-04T00:00:00.000Z",
      description: "october cash",
      source: { kind: "manual", authorized_by: OPERATOR },
      evidence_refs: ["test:carry"],
      lines: [
        { account_code: "1100", debit_yen: 7, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 7, tax_category: "non_taxable" },
      ],
    });
    const after = buildTrialBalance({ asOf: "2026-10-31" }).rows.find(
      (row) => row.account_code === "1100",
    )?.balance_yen;
    expect(before).toBeTypeOf("number");
    expect(after).toBe((before ?? 0) + 7);
    expect(
      buildTrialBalance({ asOf }).rows.find((row) => row.account_code === "1100")?.balance_yen,
    ).toBe(before);
  });
});
