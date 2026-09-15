import { describe, expect, it } from "vitest";
import {
  assessBlueReturnDeduction,
  allocateYen,
  BASIC_DEDUCTION_YEN,
  BLUE_RETURN_DEDUCTION_10,
  BLUE_RETURN_DEDUCTION_55,
  BLUE_RETURN_DEDUCTION_65,
  computeIncomeTaxYen,
  computeReconstructionSurtaxYen,
  filterJournalsInPeriod,
  STATUTORY_EXPENSE_LINES,
  truncateTaxableIncomeYen,
} from "../src/lib/finance/sole-proprietor-blue-return.js";
import type { JournalEntry } from "../schemas/finance/journal-entry.js";

describe("sole proprietor blue return deduction gate", () => {
  const ready = {
    doubleEntry: true,
    entityOk: true,
    booksReady: true,
    hasBalanceSheet: true,
    hasProfitLoss: true,
  };

  it("applies 0 when business income is 0", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 0,
      filing: { version: 1, calendar_year: 2026 },
      ...ready,
    });
    expect(gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_55);
    expect(gate.applied_deduction_yen).toBe(0);
    expect(gate.etax_evidence).toBe(false);
  });

  it("caps at 550k without e-Tax or denshi evidence when books ready", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 1_000_000,
      filing: { version: 1, calendar_year: 2026 },
      ...ready,
    });
    expect(gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_55);
    expect(gate.applied_deduction_yen).toBe(BLUE_RETURN_DEDUCTION_55);
  });

  it("raises cap to 650k with e-Tax evidence", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 1_000_000,
      filing: {
        version: 1,
        calendar_year: 2026,
        etax_submitted_at: "2027-03-10T12:00:00+09:00",
      },
      ...ready,
    });
    expect(gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_65);
    expect(gate.applied_deduction_yen).toBe(BLUE_RETURN_DEDUCTION_65);
    expect(gate.etax_evidence).toBe(true);
  });

  it("raises cap to 650k with denshi yuryo notification", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 1_000_000,
      filing: {
        version: 1,
        calendar_year: 2026,
        denshi_yuryo_notified_at: "2027-03-01T09:00:00+09:00",
      },
      ...ready,
    });
    expect(gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_65);
    expect(gate.applied_deduction_yen).toBe(BLUE_RETURN_DEDUCTION_65);
  });

  it("does not exceed business income", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 100_000,
      filing: {
        version: 1,
        calendar_year: 2026,
        etax_submitted_at: "2027-03-10T12:00:00+09:00",
      },
      ...ready,
    });
    expect(gate.applied_deduction_yen).toBe(100_000);
  });

  it("falls back to 100k when books are not ready", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 1_000_000,
      filing: { version: 1, calendar_year: 2026 },
      doubleEntry: true,
      entityOk: true,
      booksReady: false,
      hasBalanceSheet: true,
      hasProfitLoss: true,
    });
    expect(gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_10);
    expect(gate.applied_deduction_yen).toBe(BLUE_RETURN_DEDUCTION_10);
  });

  it("does not claim 550k when readiness flags are omitted", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 1_000_000,
      filing: { version: 1, calendar_year: 2026 },
    });
    expect(gate.double_entry).toBe(false);
    expect(gate.entity_ok).toBe(false);
    expect(gate.books_ready).toBe(false);
    expect(gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_10);
  });

  it("falls back to 100k when entity is not sole proprietorship", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 1_000_000,
      filing: { version: 1, calendar_year: 2026 },
      doubleEntry: true,
      entityOk: false,
      booksReady: true,
      hasBalanceSheet: true,
      hasProfitLoss: true,
    });
    expect(gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_10);
  });

  it("warns on year mismatch without claiming etax evidence", () => {
    const gate = assessBlueReturnDeduction({
      calendarYear: 2026,
      businessIncomeYen: 1_000_000,
      filing: {
        version: 1,
        calendar_year: 2025,
        etax_submitted_at: "2026-03-10T12:00:00+09:00",
      },
      yearMismatch: true,
      ...ready,
    });
    expect(gate.year_mismatch).toBe(true);
    expect(gate.etax_evidence).toBe(false);
    expect(gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_55);
  });

  it("exposes basic deduction constant for Form B", () => {
    expect(BASIC_DEDUCTION_YEN).toBe(580_000);
  });
});

describe("income tax quick table and truncation", () => {
  it("returns 0 for zero taxable income", () => {
    expect(computeIncomeTaxYen(0)).toBe(0);
    expect(computeReconstructionSurtaxYen(0)).toBe(0);
  });

  it("applies 5% bracket and reconstruction surtax", () => {
    const tax = computeIncomeTaxYen(1_000_000);
    expect(tax).toBe(50_000);
    expect(computeReconstructionSurtaxYen(tax)).toBe(1_050);
  });

  it("applies 10% bracket with deduction", () => {
    expect(computeIncomeTaxYen(2_000_000)).toBe(102_500);
  });

  it("truncates taxable income to thousands", () => {
    expect(truncateTaxableIncomeYen(770_999)).toBe(770_000);
    expect(truncateTaxableIncomeYen(1_949_999)).toBe(1_949_000);
    expect(truncateTaxableIncomeYen(-100)).toBe(0);
  });

  it("uses truncated boundaries for brackets", () => {
    expect(computeIncomeTaxYen(truncateTaxableIncomeYen(1_949_999))).toBe(
      Math.floor(1_949_000 * 0.05),
    );
    expect(computeIncomeTaxYen(1_950_000)).toBe(Math.floor(1_950_000 * 0.1 - 97_500));
  });

  it("allocates business yen with floor", () => {
    expect(allocateYen(100_000, 60)).toEqual({ business_yen: 60_000, household_yen: 40_000 });
    expect(allocateYen(100_001, 60)).toEqual({ business_yen: 60_000, household_yen: 40_001 });
  });
});

describe("period journal filter and statutory lines", () => {
  it("filters journals to calendar year", () => {
    const entries = [
      {
        entry_id: "J1",
        occurred_at: "2025-12-31T00:00:00.000Z",
        description: "prior",
        lines: [
          { account_code: "1100", debit_yen: 1, credit_yen: 0 },
          { account_code: "4100", debit_yen: 0, credit_yen: 1 },
        ],
        evidence_refs: ["t"],
        source: { kind: "manual" as const, authorized_by: "test" },
      },
      {
        entry_id: "J2",
        occurred_at: "2026-06-01T00:00:00.000Z",
        description: "current",
        lines: [
          { account_code: "1100", debit_yen: 100, credit_yen: 0 },
          { account_code: "4100", debit_yen: 0, credit_yen: 100 },
        ],
        evidence_refs: ["t"],
        source: { kind: "manual" as const, authorized_by: "test" },
      },
    ] as JournalEntry[];
    const filtered = filterJournalsInPeriod(entries, "2026-01-01", "2026-12-31");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.entry_id).toBe("J2");
  });

  it("lists all statutory expense lines", () => {
    expect(STATUTORY_EXPENSE_LINES).toHaveLength(18);
    expect(STATUTORY_EXPENSE_LINES[0]).toBe("租税公課");
    expect(STATUTORY_EXPENSE_LINES.at(-1)).toBe("雑費");
  });
});
