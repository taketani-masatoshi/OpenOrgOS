import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runValidateReport } from "../src/commands/validate.js";
import { appendJournalEntry, loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { lastDayOfMonth } from "../src/lib/finance/fiscal-year.js";
import { reverseJournalEntry } from "../src/lib/finance/journal-reverse.js";
import { buildBalanceSheet } from "../src/lib/finance/ledger/balance-sheet.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { subsidiaryLedgerIntegrityIssues } from "../src/lib/finance/ledger/subsidiary-ledger.js";
import {
  buildMonthlyCloseEvidence,
  closeAccountingMonth,
  evaluateMonthlyCloseGates,
  monthBankTieOut,
} from "../src/lib/finance/monthly-close.js";
import {
  diffCashbookWorkedExample,
  projectCashbookFromBooks,
  scoreCashbookExample,
  type CashbookBooksInput,
  type CashbookExampleRow,
} from "../src/lib/finance/ledger/cashbook-display.js";
import { buildConsumptionTaxSummary } from "../src/lib/finance/consumption-tax.js";
import { isMonthLocked, loadPeriodLocks, lockMonth, periodLockIntegrityIssues, resetPeriodLocksForTests, unlockMonth } from "../src/lib/finance/period-lock.js";
import { buildMonthCloseChecklist } from "../src/lib/product/ledger-month-close-checklist.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  applyFixtureStatementRoles,
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

const MONTH = "2026-09";
const OPERATOR = "OP-TEST";
const CASHBOOK_EXAMPLE_PATH = join(
  import.meta.dirname,
  "fixtures/monthly-close/cashbook-example.yaml",
);
const CASHBOOK_BOOKS_PATH = join(
  import.meta.dirname,
  "fixtures/monthly-close/cashbook-handguide-books.yaml",
);
const CASHBOOK_SOURCE = join(
  import.meta.dirname,
  "../src/lib/finance/ledger/cashbook-display.js",
).replace(/\.js$/, ".ts");
const MONTHLY_CLOSE_SOURCE = join(
  import.meta.dirname,
  "../src/lib/finance/monthly-close.js",
).replace(/\.js$/, ".ts");

function loadCashbookExample(): {
  rows: CashbookExampleRow[];
  year_end_cash_yen: number;
} {
  const parsed = parseYaml(readFileSync(CASHBOOK_EXAMPLE_PATH, "utf8")) as {
    rows?: CashbookExampleRow[];
    year_end_cash_yen?: number;
  };
  if (!parsed.rows?.length || typeof parsed.year_end_cash_yen !== "number") {
    throw new Error("cashbook-example.yaml must list rows and year_end_cash_yen");
  }
  return { rows: parsed.rows, year_end_cash_yen: parsed.year_end_cash_yen };
}

function loadCashbookBooks(): CashbookBooksInput & { cash_account_code: string } {
  const parsed = parseYaml(readFileSync(CASHBOOK_BOOKS_PATH, "utf8")) as {
    cash_account_code?: string;
    opening?: CashbookBooksInput["opening"];
    movements?: CashbookBooksInput["movements"];
  };
  if (!parsed.cash_account_code || !parsed.opening || !parsed.movements) {
    throw new Error("cashbook-handguide-books.yaml must list cash account, opening, movements");
  }
  return {
    cash_account_code: parsed.cash_account_code,
    opening: parsed.opening,
    movements: parsed.movements,
  };
}

function bankPath(): string {
  return join(getDataDir(), "finance", "bank-statements.yaml");
}

function writeBank(yaml: string): void {
  writeFileSync(bankPath(), `${yaml.trim()}\n`, "utf-8");
}

function removeBank(): void {
  if (existsSync(bankPath())) unlinkSync(bankPath());
}

function previousMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year!, monthNumber! - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function cashDeltaYen(month: string): number {
  const end =
    buildTrialBalance({ asOf: lastDayOfMonth(month) }).rows.find(
      (row) => row.account_code === "1100",
    )?.balance_yen ?? 0;
  const start =
    buildTrialBalance({ asOf: lastDayOfMonth(previousMonth(month)) }).rows.find(
      (row) => row.account_code === "1100",
    )?.balance_yen ?? 0;
  return end - start;
}

function tiedLines(month: string, status = "matched"): string {
  const delta = cashDeltaYen(month);
  if (delta === 0) {
    return `  - id: BS-${month}-IN
    date: "${month}-10"
    direction: inflow
    amount: 1
    status: ${status}
  - id: BS-${month}-OUT
    date: "${month}-11"
    direction: outflow
    amount: 1
    status: ${status}`;
  }
  const direction = delta > 0 ? "inflow" : "outflow";
  return `  - id: BS-${month}
    date: "${month}-10"
    direction: ${direction}
    amount: ${Math.abs(delta)}
    status: ${status}`;
}

function writeTiedBank(months: string[], extra = ""): void {
  writeBank(`entries:\n${months.map((month) => tiedLines(month)).join("\n")}\n${extra}`);
}

function lockPrior(): void {
  lockMonth({ month: "2026-08", lockedBy: OPERATOR, reason: "prior month" });
}

function plantJournal(entry: {
  entry_id: string;
  occurred_at: string;
  description: string;
  lines: Array<Record<string, unknown>>;
}): void {
  const path = join(getDataDir(), "finance", "journal-entries.yaml");
  const file = loadJournalEntries();
  file.entries.push({
    ...entry,
    source: { kind: "manual", authorized_by: OPERATOR },
    evidence_refs: [`test:${entry.entry_id}`],
  } as (typeof file.entries)[number]);
  writeFileSync(path, stringifyYaml(file));
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
    resetPeriodLocksForTests();
    removeBank();
  });

  afterEach(() => {
    removeBank();
    resetFixtureJournalEntries();
  });

  it("closes 2026-09 when journals, statements, subsidiary and validate pass", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeTiedBank([MONTH]);
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
    expect(second.ok).toBe(false);
    expect(second.evaluation.errors.some((error) => error.startsWith("month-exclusive"))).toBe(
      true,
    );
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
    const lines = [
      { account_code: "9999", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" as const },
      { account_code: "1100", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" as const },
    ];
    expect(() =>
      manualEntry({
        entryId: "JE-UNKNOWN-ACCOUNT",
        occurredAt: "2026-09-15T00:00:00.000Z",
        lines,
      }),
    ).toThrow(/Unknown account code/);
    plantJournal({
      entry_id: "JE-UNKNOWN-ACCOUNT",
      occurred_at: "2026-09-15T00:00:00.000Z",
      description: "JE-UNKNOWN-ACCOUNT",
      lines,
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
    const before = loadJournalEntries().entries.map((entry) => entry.entry_id).sort();
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(false);
    expect(closed.posted_entry_ids).toEqual([]);
    expect(loadJournalEntries().entries.map((entry) => entry.entry_id).sort()).toEqual(before);
    expect(closed.evaluation.errors.some((error) => error.startsWith("bank-unmatched"))).toBe(
      true,
    );
  });

  it("does not post close journals when the prior month is unlocked", () => {
    useFinanceFixtureTenant();
    writeBank(`
entries:
  - id: BS-OK
    date: "2026-09-03"
    direction: inflow
    amount: 500
    status: matched
`);
    const before = loadJournalEntries().entries.map((entry) => entry.entry_id).sort();
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(false);
    expect(closed.posted_entry_ids).toEqual([]);
    expect(loadJournalEntries().entries.map((entry) => entry.entry_id).sort()).toEqual(before);
    expect(
      closed.evaluation.errors.some((error) => error.startsWith("prior-month-locked")),
    ).toBe(true);
    expect(closed.evaluation.errors.some((error) => error.includes("unlocked"))).toBe(true);
  });

  it("does not lock when cash is on the books and the bank file is missing", () => {
    useFinanceFixtureTenant();
    lockPrior();
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(existsSync(bankPath())).toBe(false);
    expect(closed.evaluation.items.find((item) => item.id === "bank-imported")).toMatchObject({
      pass: false,
      level: "error",
      detail: "no bank file",
    });
    expect(closed.locked).toBe(false);
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
    writeTiedBank(
      [MONTH],
      `  - id: BS-NEXT
    date: "2026-10-02"
    direction: outflow
    amount: 800
    status: unmatched`,
    );
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
    writeTiedBank([MONTH]);
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.evaluation.warnings.some((warning) => warning.startsWith("monthly-reconcile"))).toBe(
      true,
    );
    expect(closed.evaluation.errors.some((error) => error.startsWith("monthly-reconcile"))).toBe(false);
    expect(closed.locked).toBe(true);
  });

  it("does not lock when a control account has an unassigned balance", () => {
    useFinanceFixtureTenant();
    const lines = [
      { account_code: "1150", debit_yen: 500, credit_yen: 0, tax_category: "out_of_scope" as const },
      { account_code: "4100", debit_yen: 0, credit_yen: 500, tax_category: "non_taxable" as const },
    ];
    expect(() =>
      manualEntry({
        entryId: "JE-UNASSIGNED-AR",
        occurredAt: "2026-09-11T00:00:00.000Z",
        lines,
      }),
    ).toThrow(/counterparty_id required/);
    plantJournal({
      entry_id: "JE-UNASSIGNED-AR",
      occurred_at: "2026-09-11T00:00:00.000Z",
      description: "JE-UNASSIGNED-AR",
      lines,
    });
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(false);
    expect(closed.ok).toBe(false);
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
    writeTiedBank([MONTH]);
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
    writeTiedBank([MONTH]);
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
    expect(locks[2]?.reason).toBe("correct depreciation");
    expect(locks[1]?.prior_evidence_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(locks[2]?.prior_evidence_sha256).toBe(locks[1]?.prior_evidence_sha256);
    expect(periodLockIntegrityIssues().some((issue) => issue.includes("prior evidence"))).toBe(
      false,
    );
  });

  it("keeps an existing lock when a later gate failure is found", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeTiedBank([MONTH]);
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
    expect(() =>
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
      }),
    ).toThrow(/tax_category required/);
    plantJournal({
      entry_id: "JE-NO-TAX",
      occurred_at: "2026-09-12T00:00:00.000Z",
      description: "missing category",
      lines: [
        { account_code: "1100", debit_yen: 50, credit_yen: 0 },
        { account_code: "4100", debit_yen: 0, credit_yen: 50 },
      ],
    });
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.evaluation.errors.some((error) => error.startsWith("consumption-tax"))).toBe(
      true,
    );
    expect(closed.locked).toBe(false);
  });

  it("posts a specified accrual and ignores a zero adjustment", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeTiedBank([MONTH]);
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
    writeTiedBank([MONTH]);
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
    writeTiedBank([MONTH]);
    const september = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(september.locked).toBe(true);
    writeTiedBank([MONTH, "2026-10"]);
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
    writeTiedBank([MONTH]);
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

  it("does not lock when the bank net differs from the cash account", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeBank(`
entries:
  - id: BS-OFF
    date: "2026-09-10"
    direction: inflow
    amount: 99999
    status: matched
`);
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.locked).toBe(false);
    expect(closed.evaluation.errors.some((error) => error.startsWith("bank-gl-tieout"))).toBe(
      true,
    );
  });

  it("does not close the next month when the prior bank evidence no longer matches", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeTiedBank([MONTH]);
    const september = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(september.locked).toBe(true);
    writeBank(`
entries:
  - id: BS-CHANGED
    date: "2026-09-10"
    direction: inflow
    amount: 4
    status: matched
`);
    const october = evaluateMonthlyCloseGates("2026-10");
    expect(october.errors.some((error) => error.startsWith("prior-evidence"))).toBe(true);
    expect(october.can_lock).toBe(false);
  });

  it("refuses a second close of a month that is already locked", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeTiedBank([MONTH]);
    const first = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(first.locked).toBe(true);
    const second = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(second.ok).toBe(false);
    expect(second.locked).toBe(true);
    expect(second.posted_entry_ids).toEqual([]);
    expect(second.evaluation.errors.some((error) => error.startsWith("month-exclusive"))).toBe(
      true,
    );
    expect(loadPeriodLocks().locks.filter((row) => row.month === MONTH && row.status === "locked")).toHaveLength(
      1,
    );
  });

  it("does not treat opening cash as a bank movement", () => {
    useFinanceFixtureTenant();
    lockMonth({ month: "2026-07", lockedBy: OPERATOR, reason: "prior month" });
    writeBank(`
entries:
  - id: BS-2026-08-IN
    date: "2026-08-10"
    direction: inflow
    amount: 1
    status: matched
  - id: BS-2026-08-OUT
    date: "2026-08-11"
    direction: outflow
    amount: 1
    status: matched
`);
    const tie = monthBankTieOut("2026-08");
    expect(tie.glDelta).toBe(0);
    expect(tie.pass).toBe(true);
    const gate = evaluateMonthlyCloseGates("2026-08").items.find(
      (item) => item.id === "bank-gl-tieout",
    );
    expect(gate?.pass).toBe(true);
  });

  it("does not lock when a bank inflow only restates the opening cash", () => {
    useFinanceFixtureTenant();
    lockMonth({ month: "2026-07", lockedBy: OPERATOR, reason: "prior month" });
    writeBank(`
entries:
  - id: BS-OPENING
    date: "2026-08-10"
    direction: inflow
    amount: 1000000
    status: matched
`);
    const tie = monthBankTieOut("2026-08");
    expect(tie.pass).toBe(false);
    expect(tie.glDelta).toBe(0);
    expect(tie.bankNet).toBe(1_000_000);
    const evaluation = evaluateMonthlyCloseGates("2026-08");
    expect(evaluation.items.find((item) => item.id === "bank-gl-tieout")?.pass).toBe(false);
    expect(evaluation.errors.some((error) => error.startsWith("bank-gl-tieout"))).toBe(true);
  });

  it("changes the bank evidence hash when the operator changes", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeTiedBank([MONTH]);
    const closed = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(closed.ok).toBe(true);
    const stored = loadPeriodLocks().locks.find(
      (row) => row.month === MONTH && row.status === "locked",
    );
    const other = buildMonthlyCloseEvidence(closed.evaluation, "OP-OTHER");
    expect(other.bank_reconciliation_sha256).not.toBe(stored?.evidence?.bank_reconciliation_sha256);
    expect(other.gate_results_sha256).toBe(stored?.evidence?.gate_results_sha256);
  });

  it("does not close the next month when the prior trial balance changed", () => {
    useFinanceFixtureTenant();
    lockPrior();
    writeTiedBank([MONTH]);
    const september = closeAccountingMonth({ month: MONTH, operatorId: OPERATOR });
    expect(september.locked).toBe(true);
    const path = join(getDataDir(), "finance", "journal-entries.yaml");
    const file = parseYaml(readFileSync(path, "utf-8")) as {
      entries: Array<{
        lines: Array<{ account_code: string; debit_yen: number; credit_yen: number }>;
      }>;
    };
    let changed = false;
    for (const entry of file.entries) {
      if (entry.lines.some((line) => line.account_code === "1100")) continue;
      const debit = entry.lines.find((line) => line.debit_yen > 0);
      const credit = entry.lines.find((line) => line.credit_yen > 0);
      if (!debit || !credit) continue;
      debit.debit_yen += 1;
      credit.credit_yen += 1;
      changed = true;
      break;
    }
    expect(changed).toBe(true);
    writeFileSync(path, stringifyYaml(file), "utf-8");
    const october = evaluateMonthlyCloseGates("2026-10");
    expect(october.errors.some((error) => error.startsWith("prior-evidence"))).toBe(true);
    expect(october.can_lock).toBe(false);
  });

  it("scores the handguide January cashbook from company books with an empty official diff", () => {
    const pin = loadCashbookExample();
    const books = loadCashbookBooks();
    const display = projectCashbookFromBooks({
      opening: books.opening,
      movements: books.movements,
    });
    expect(diffCashbookWorkedExample(display, pin.rows)).toEqual([]);
    expect(scoreCashbookExample(display, pin.rows)).toBe(1);
    expect(display.rows.at(-1)?.balance_yen).toBe(83_800);
    expect(pin.year_end_cash_yen).toBe(372_772);
    expect(pin.rows.some((row) => row.balance_yen === 540_000)).toBe(false);
    expect(pin.rows.some((row) => row.summary === "元入金")).toBe(false);
    expect(JSON.stringify(books)).toContain("cash_account_code");
    expect(JSON.stringify(display)).not.toContain("cash_account_code");
  });

  it("does not treat pin echo or a broken running balance as the books path", () => {
    const pin = loadCashbookExample();
    expect(scoreCashbookExample(pin.rows, pin.rows)).toBe(1);
    const shifted = {
      headers: ["月", "日", "摘要", "入金", "出金", "現金残高"],
      rows: pin.rows.map((row, index) =>
        index === pin.rows.length - 1 ? { ...row, balance_yen: row.balance_yen + 1 } : row,
      ),
    };
    expect(scoreCashbookExample(shifted, pin.rows)).toBe(0);
    expect(diffCashbookWorkedExample(shifted, pin.rows)).toContain("row_6:balance");
  });

  it("does not load the cashbook pin or books fixture from product code", () => {
    const cashbookSource = readFileSync(CASHBOOK_SOURCE, "utf8");
    const monthlySource = readFileSync(MONTHLY_CLOSE_SOURCE, "utf8");
    for (const source of [cashbookSource, monthlySource]) {
      expect(source).not.toContain("tests/fixtures");
      expect(source).not.toContain("cashbook-example.yaml");
      expect(source).not.toContain("cashbook-handguide-books.yaml");
    }
    expect(cashbookSource).not.toMatch(/from ["']yaml["']/);
  });
});
