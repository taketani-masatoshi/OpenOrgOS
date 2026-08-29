import { describe, expect, it, beforeEach } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { buildBalanceSheet } from "../src/lib/finance/ledger/balance-sheet.js";
import { buildSubsidiaryLedger } from "../src/lib/finance/ledger/subsidiary-ledger.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import {
  lockMonth,
  unlockMonth,
  isMonthLocked,
  loadPeriodLocks,
} from "../src/lib/finance/period-lock.js";
import {
  buildGlEquityChangeRows,
  buildGlKessanBsRows,
} from "../src/lib/finance/ledger/balance-sheet.js";
import {
  buildGlKessanPlRows,
  buildGlProfitLossSummary,
} from "../src/lib/finance/gl-report-basis.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("balance sheet", () => {
  beforeEach(() => resetFixtureJournalEntries());

  it("balances assets against liabilities and equity", () => {
    useFinanceFixtureTenant();
    const report = buildBalanceSheet({ asOf: "2026-08-31", fiscalYear: "FY2026" });
    expect(report.assets.length).toBeGreaterThan(0);
    expect(report.total_assets_yen).toBeGreaterThan(0);
    expect(report.balanced).toBe(true);
    expect(report.net_income_yen).toBe(0);
  });

  it("uses after-tax net profit, not operating profit", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-BS-NET-001",
      occurred_at: "2026-09-10T00:00:00.000Z",
      description: "sectioned P/L",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:bs-net"],
      lines: [
        { account_code: "1100", debit_yen: 6500, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 10000, tax_category: "non_taxable" },
        { account_code: "5100", debit_yen: 2000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "5500", debit_yen: 1000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "8100", debit_yen: 500, credit_yen: 0, tax_category: "out_of_scope" },
      ],
    });
    const pl = buildGlProfitLossSummary({ fiscalYear: "FY2026", asOf: "2026-09-30" });
    expect(pl.operating_profit).toBe(8000);
    expect(pl.net_profit).toBe(6500);
    const bs = buildBalanceSheet({ asOf: "2026-09-30", fiscalYear: "FY2026" });
    expect(bs.net_income_yen).toBe(6500);
    expect(bs.balanced).toBe(true);
  });
});

describe("period lock", () => {
  beforeEach(() => resetFixtureJournalEntries());

  it("blocks journal posts to locked months", () => {
    useFinanceFixtureTenant();
    lockMonth({ month: "2026-09", lockedBy: "test" });
    expect(isMonthLocked("2026-09")).toBe(true);
    expect(() =>
      appendJournalEntry({
        entry_id: "JE-LOCK-TEST",
        occurred_at: "2026-09-15T00:00:00.000Z",
        description: "blocked",
        source: { kind: "manual", authorized_by: "test" },
        evidence_refs: ["test:lock"],
        lines: [
          { account_code: "1100", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "3200", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" },
        ],
      }),
    ).toThrow(/locked/);
  });

  it("keeps unlock history instead of deleting the lock row", () => {
    useFinanceFixtureTenant();
    lockMonth({ month: "2026-09", lockedBy: "test" });
    unlockMonth({ month: "2026-09", unlockedBy: "approver", reason: "late invoice" });
    expect(isMonthLocked("2026-09")).toBe(false);
    const file = loadPeriodLocks();
    expect(file.locks).toHaveLength(2);
    expect(file.locks[1]?.status).toBe("unlocked");
    expect(file.locks[1]?.reason).toBe("late invoice");
  });
});

describe("subsidiary ledger", () => {
  beforeEach(() => resetFixtureJournalEntries());

  it("groups AR by counterparty_id and compares control to trial balance", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-AR-CP-001",
      occurred_at: "2026-09-05T00:00:00.000Z",
      description: "AR customer A",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:ar"],
      lines: [
        {
          account_code: "1150",
          debit_yen: 10000,
          credit_yen: 0,
          counterparty_id: "CUST-A",
          tax_category: "out_of_scope",
        },
        { account_code: "4100", debit_yen: 0, credit_yen: 10000, tax_category: "non_taxable" },
      ],
    });
    const report = buildSubsidiaryLedger({ accountCode: "1150", asOf: "2026-09-30" });
    const trial = buildTrialBalance({ asOf: "2026-09-30" });
    const control = trial.rows.find((row) => row.account_code === "1150")?.balance_yen;
    expect(report.lines.some((l) => l.counterparty_id === "CUST-A" && l.balance_yen === 10000)).toBe(
      true,
    );
    expect(report.control_balance_yen).toBe(control);
    expect(report.control_balance_yen).toBe(10000);
    expect(report.balanced).toBe(true);
  });
});

describe("kessan PL rows", () => {
  it("includes section headers from CoA classification", () => {
    useFinanceFixtureTenant();
    const rows = buildGlKessanPlRows({ fiscalYear: "FY2026", asOf: "2026-08-31" });
    expect(rows.some((r) => r.label === "Ⅰ. 売上高")).toBe(true);
    expect(rows.some((r) => r.label === "Ⅳ. 営業利益")).toBe(true);
  });

  it("includes BS current/noncurrent sections and equity change", () => {
    useFinanceFixtureTenant();
    const bs = buildGlKessanBsRows({ fiscalYear: "FY2026", asOf: "2026-08-31" });
    expect(bs.some((r) => r.label === "流動資産")).toBe(true);
    expect(bs.some((r) => r.label === "資産合計")).toBe(true);
    const equity = buildGlEquityChangeRows({ fiscalYear: "FY2026", asOf: "2026-08-31" });
    expect(equity.some((r) => r.label === "期首純資産")).toBe(true);
    expect(equity.some((r) => r.label === "期末純資産")).toBe(true);
  });
});
