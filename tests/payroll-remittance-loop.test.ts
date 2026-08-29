import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  postMonthlyPlJournalEntries,
  postPayrollJournalEntry,
  postPayrollPaymentJournalEntry,
  postRemittanceJournalEntry,
} from "../src/lib/finance/journal-sources.js";
import {
  remittanceObligationFromCashflowCategory,
  resolveRemittanceFromCalendarRow,
} from "../src/lib/finance/remittance-from-calendar.js";
import { buildTaxCalendarPortfolio } from "../src/lib/finance/tax-calendar-portfolio.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("remittance from calendar mapping", () => {
  it("maps cashflow categories to remittance obligations", () => {
    expect(remittanceObligationFromCashflowCategory("withholding")).toBe("withholding");
    expect(remittanceObligationFromCashflowCategory("social_insurance")).toBe(
      "social_insurance",
    );
    expect(remittanceObligationFromCashflowCategory("consumption_tax")).toBe(
      "consumption_tax",
    );
    expect(remittanceObligationFromCashflowCategory("property_tax")).toBeNull();
    expect(remittanceObligationFromCashflowCategory(undefined)).toBeNull();
  });

  it("resolves a fixture calendar row into remittance inputs", () => {
    useFinanceFixtureTenant();
    const portfolio = buildTaxCalendarPortfolio({ today: "2026-09-15" });
    const withholding = portfolio.rows.find(
      (row) => row.cashflow_category === "withholding",
    );
    expect(withholding).toBeTruthy();
    const resolved = resolveRemittanceFromCalendarRow({
      rowId: withholding!.id,
      asOf: "2026-09-15",
    });
    expect(resolved.obligation).toBe("withholding");
    expect(resolved.period).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("payroll and statutory remittance loop", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("accrues payroll then remits withholding/social and pays net", () => {
    useFinanceFixtureTenant();
    postPayrollJournalEntry({
      period: "2026-09",
      authorizedBy: "OP-TEST",
      grossYen: 100000,
      withholdingYen: 10000,
      socialEmployerYen: 15000,
    });

    expect(
      postRemittanceJournalEntry({
        period: "2026-09",
        obligation: "withholding",
        authorizedBy: "OP-TEST",
      }),
    ).toBeTruthy();
    expect(
      postRemittanceJournalEntry({
        period: "2026-09",
        obligation: "social_insurance",
        authorizedBy: "OP-TEST",
      }),
    ).toBeTruthy();
    expect(
      postPayrollPaymentJournalEntry({
        period: "2026-09",
        authorizedBy: "OP-TEST",
      }),
    ).toBe("JE-PAYROLL-PAY-2026-09");

    const trial = buildTrialBalance({ asOf: "2026-09-30" });
    expect(Math.abs(trial.rows.find((r) => r.account_code === "2120")?.balance_yen ?? 0)).toBe(0);
    expect(Math.abs(trial.rows.find((r) => r.account_code === "2130")?.balance_yen ?? 0)).toBe(0);
    expect(Math.abs(trial.rows.find((r) => r.account_code === "2140")?.balance_yen ?? 0)).toBe(0);
  });

  it("settles consumption tax remittance from monthly P/L accruals", () => {
    useFinanceFixtureTenant();
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    const before = buildTrialBalance({ asOf: "2026-09-30" });
    const payable = before.rows.find((r) => r.account_code === "2160")?.balance_yen ?? 0;
    const receivable = before.rows.find((r) => r.account_code === "2170")?.balance_yen ?? 0;
    expect(payable + receivable).toBeGreaterThan(0);

    const posted = postRemittanceJournalEntry({
      period: "2026-09",
      obligation: "consumption_tax",
      authorizedBy: "OP-TEST",
    });
    expect(posted).toBeTruthy();

    const after = buildTrialBalance({ asOf: "2026-09-30" });
    expect(Math.abs(after.rows.find((r) => r.account_code === "2160")?.balance_yen ?? 0)).toBe(0);
    expect(Math.abs(after.rows.find((r) => r.account_code === "2170")?.balance_yen ?? 0)).toBe(0);
  });
});
