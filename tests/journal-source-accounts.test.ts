import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { resolveJournalSourceAccounts } from "../src/lib/finance/journal-source-accounts.js";
import { postArReceiptJournalEntry } from "../src/lib/finance/journal-sources.js";
import { postDepreciationJournalEntries } from "../src/lib/finance/depreciation.js";
import { trialBalanceIntegrityIssues } from "../src/lib/finance/ledger/trial-balance.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("journal source accounts", () => {
  beforeEach(() => resetFixtureJournalEntries());
  it("maps all automated journal accounts to CoA entries", () => {
    useFinanceFixtureTenant();
    const coa = loadChartOfAccounts();
    const accounts = resolveJournalSourceAccounts(coa);
    const codes = new Set(coa.accounts.map((row) => row.code));
    for (const code of Object.values(accounts)) {
      expect(codes.has(code)).toBe(true);
    }
  });

  it("does not produce unknown account codes in trial balance integrity", () => {
    useFinanceFixtureTenant();
    const accounts = resolveJournalSourceAccounts();
    postArReceiptJournalEntry({
      ledgerEntryId: "AR-TEST-001",
      amountYen: 5000,
      counterpartyId: "PROP-001",
      occurredAt: "2026-09-15T00:00:00.000Z",
      authorizedBy: "test",
    });
    postDepreciationJournalEntries({
      period: "2026-09",
      authorizedBy: "test",
    });
    const issues = trialBalanceIntegrityIssues();
    const unknown = issues.filter((issue) => issue.includes("Unknown account code"));
    expect(unknown).toEqual([]);
    expect(accounts.accounts_receivable).toBe("1150");
    expect(accounts.bank_control).toBe("1100");
  });
});
