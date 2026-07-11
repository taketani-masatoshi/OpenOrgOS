import { beforeEach, describe, expect, it } from "vitest";
import { chartOfAccountsSchema } from "../schemas/finance.js";
import {
  runIntegrityChecks,
  validateJpBankCorporateIntegrity,
} from "../src/lib/integrity.js";
import { runValidateReport } from "../src/commands/validate.js";
import { setTenantId } from "../src/lib/tenant.js";

const chart = chartOfAccountsSchema.parse({
  currency: "JPY",
  accounts: [
    { code: "1100", name: "Cash", type: "asset", normal_balance: "debit" },
    { code: "5100", name: "Expense", type: "expense", normal_balance: "debit" },
  ],
  category_mapping: { revenue: {}, expense: {} },
});

describe("validate report and JP bank integrity", () => {
  beforeEach(() => setTenantId("mal"));

  it(
    "returns a non-exiting L1-safe report with repo-relative paths",
    () => {
      const report = runValidateReport();
      expect(report.ok).toBe(true);
      expect(report.error_count).toBe(0);
      expect(report.warning_count).toBeGreaterThanOrEqual(0);
      expect(report.issues.every((issue) => !issue.path.startsWith("/"))).toBe(true);
      expect(JSON.stringify(report)).not.toMatch(/\b\d{7,}\b/);
    },
    30_000
  );

  it("keeps the enabled tenant's JP bank files free of integrity errors", () => {
    const errors = runIntegrityChecks().filter(
      (issue) =>
        issue.level === "error" &&
        [
          "data/finance/payment-calendar.yaml",
          "data/finance/ar-ap-ledger.yaml",
          "data/finance/collection-terms.yaml",
        ].includes(issue.file)
    );
    expect(errors).toEqual([]);
  });

  it("detects schema, duplicate, transfer, term, due-date, and chart-reference errors", () => {
    const issues = validateJpBankCorporateIntegrity({
      chartOfAccounts: chart,
      paymentCalendar: {
        currency: "JPY",
        entries: [
          {
            id: "PAY-DUP",
            date: "2026-02-30",
            direction: "transfer",
            amount: 1,
            category: "transfer",
            account_id: "BANK-001",
            counterparty_account_id: "BANK-001",
            chart_account_id: "9999",
            description: "fixture",
          },
          {
            id: "PAY-DUP",
            date: "2026-02-28",
            direction: "outflow",
            amount: 1,
            category: "expense",
            description: "fixture",
          },
        ],
      },
      collectionTerms: {
        currency: "JPY",
        rules: [
          {
            id: "TERM-DUP",
            label: "AR",
            kind: "ar",
            days_after_booking: 10,
            chart_account_id: "9999",
          },
          {
            id: "TERM-DUP",
            label: "AP",
            kind: "ap",
            days_after_booking: 0,
          },
        ],
      },
      arApLedger: {
        currency: "JPY",
        entries: [
          {
            id: "AR-DUP",
            kind: "ar",
            amount: 1,
            booked_date: "2026-07-10",
            due_date: "2026-07-01",
            counterparty: "fixture",
            description: "fixture",
            collection_term_id: "TERM-DUP",
            due_date_source: "collection-term",
            chart_account_id: "9999",
          },
          {
            id: "AR-DUP",
            kind: "ap",
            amount: 1,
            booked_date: "2026-07-01",
            due_date: "2026-07-01",
            counterparty: "fixture",
            description: "fixture",
            collection_term_id: "MISSING",
          },
        ],
      },
    });
    const messages = issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("duplicate payment calendar id");
    expect(messages).toContain("transfer requires distinct");
    expect(messages).toContain("duplicate collection term id");
    expect(messages).toContain("duplicate AR/AP id");
    expect(messages).toContain("due_date precedes booked_date");
    expect(messages).toContain("collection term kind");
    expect(messages).toContain("collection_term_id MISSING not found");
    expect(messages).toContain("due_date does not match collection term");
    expect(messages).toContain("chart_account_id 9999 not found");

    const schemaIssues = validateJpBankCorporateIntegrity({
      chartOfAccounts: chart,
      paymentCalendar: { entries: [{ id: "BAD" }] },
    });
    expect(schemaIssues[0]?.message).toContain("schema invalid");
  });
});
