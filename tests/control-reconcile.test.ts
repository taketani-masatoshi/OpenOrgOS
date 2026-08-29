import { describe, expect, it, beforeEach } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { controlAccountIntegrityIssues } from "../src/lib/finance/ledger/control-reconcile.js";
import { unpostedMonthlyPlIssues } from "../src/lib/finance/ledger/unposted-months.js";
import { postMonthlyPlJournalEntries } from "../src/lib/finance/journal-sources.js";
import { buildLedgerWorkbench } from "../src/lib/finance/ledger/workbench.js";
import { buildTaxAdvisorHandoffContent } from "../src/lib/finance/tax-advisor-handoff.js";
import { getTenantDir } from "../src/lib/tenant.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("control reconcile and unposted months", () => {
  beforeEach(() => resetFixtureJournalEntries());

  it("matches fixture cash register at cash as_of", () => {
    useFinanceFixtureTenant();
    const issues = controlAccountIntegrityIssues();
    expect(issues.filter((i) => i.message.startsWith("cash ") && i.level === "error")).toEqual([]);
  });

  it("reports unposted monthly P/L as variance until JE-MPL exists", () => {
    useFinanceFixtureTenant();
    expect(unpostedMonthlyPlIssues("2026-09").some((msg) => msg.startsWith("2026-09:"))).toBe(true);
    postMonthlyPlJournalEntries({ period: "2026-09", authorizedBy: "OP-TEST" });
    expect(unpostedMonthlyPlIssues("2026-09")).toEqual([]);
  });

  it("builds a ledger workbench snapshot", () => {
    useFinanceFixtureTenant();
    const snap = buildLedgerWorkbench({ asOf: "2026-08-31" });
    expect(snap.trial_balance.balanced).toBe(true);
    expect(snap.balance_sheet.balanced).toBe(true);
    expect(snap.as_of).toBe("2026-08-31");
    expect(snap.tax_balances.some((row) => row.account_code === "2160")).toBe(true);
    expect(Array.isArray(snap.remittance_calendar)).toBe(true);
  });

  it("parameterizes tax advisor handoff by tenant and FY", () => {
    useFinanceFixtureTenant();
    const content = buildTaxAdvisorHandoffContent({ fiscalYear: "FY2026" });
    expect(content.company_name).toBe("Fixture Books KK");
    expect(content.fiscal_year).toBe("FY2026");
    expect(content.subject).toContain("Fixture Books KK");
    expect(content.body).not.toContain("株式会社MAL");
    expect(content.body).toContain("未計上月");
    expect(content.body).toContain("消費税・法定納付");
  });

  it("has no control account errors on fixture opening cutover", () => {
    useFinanceFixtureTenant();
    const errors = controlAccountIntegrityIssues().filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("reports skipped bank reconcile when bank as_of precedes opening", () => {
    useFinanceFixtureTenant();
    const bankPath = join(getTenantDir(), "data/finance/bank-statements.yaml");
    writeFileSync(
      bankPath,
      `as_of: "2026-07-11"
entries:
  - id: BANK-TEST-001
    date: "2026-07-01"
    direction: outflow
    amount: 1000
`,
      "utf-8",
    );
    try {
      const warnings = controlAccountIntegrityIssues().filter(
        (row) => row.level === "warning" && row.message.includes("skipped"),
      );
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]!.message).toContain("2026-08-31");
    } finally {
      if (existsSync(bankPath)) unlinkSync(bankPath);
    }
  });
});
