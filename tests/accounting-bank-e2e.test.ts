import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths, getInstallRoot } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { seedLedgerDemoYear } from "../src/lib/product/ledger-seed-demo-year.js";
import { runBankImportReconcileE2E } from "../src/lib/product/ledger-bank-e2e.js";
import { postFirstOnboardingJournal } from "../src/lib/product/ledger-first-journal.js";
import { buildMonthCloseChecklist } from "../src/lib/product/ledger-month-close-checklist.js";
import { buildAccountingReadinessReport } from "../src/lib/product/ledger-accounting-readiness.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { lockMonth } from "../src/lib/finance/period-lock.js";
import { runValidateReport } from "../src/commands/validate.js";
import {
  computeBonusDraft,
  saveBonusDraft,
  postBonusDraftJournal,
} from "../src/lib/finance/payroll-bonus-yea.js";
import { ensureLedgerDemoChartOfAccounts } from "../src/lib/product/ledger-coa-ensure.js";

describe("accounting commercial paths", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  function provisionTemp(id: string) {
    workspace = mkdtempSync(join(tmpdir(), "acct-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: id,
      companyName: "Acct KK",
      adminEmail: "ceo@acct.example",
      plan: "business",
    });
    setTenantId(id);
  }

  it("seeds demo year against ensured COA and validates", () => {
    provisionTemp("acct-seed-001");
    // Simulate thin COA (product bug case) then seed
    const result = seedLedgerDemoYear({ fiscalYear: "FY2026", force: true });
    expect(result.skipped).toBe(false);
    expect(result.posted_entry_ids.length).toBe(24);
    const coa = loadChartOfAccounts();
    expect(coa.journal_source_accounts?.accounts_receivable).toBeTruthy();
    const codes = new Set(coa.accounts.map((a) => a.code));
    for (const entry of loadJournalEntries().entries) {
      for (const line of entry.lines) {
        expect(codes.has(line.account_code)).toBe(true);
      }
    }
    expect(runValidateReport({ warnings: true }).ok).toBe(true);
  });

  it("runs bank import → approve → GL e2e", () => {
    workspace = mkdtempSync(join(tmpdir(), "acct-bank-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const src = join(getInstallRoot(), "tenants/_fixture-books");
    const dest = join(workspace, "tenants/_fixture-books");
    cpSync(src, dest, { recursive: true });
    setTenantId("_fixture-books");
    const e2e = runBankImportReconcileE2E({ authorizedBy: "OP-TEST" });
    expect(e2e.imported).toBeGreaterThanOrEqual(1);
    expect(e2e.applied).not.toBeNull();
    expect(e2e.applied?.entry_id).toMatch(/^JE-/);
  });

  it("posts first onboarding journal without monthly-pl", () => {
    provisionTemp("acct-first-001");
    const posted = postFirstOnboardingJournal({ amountYen: 50_000 });
    expect(posted.skipped).toBe(false);
    expect(posted.entry_id).toBeTruthy();
    expect(loadJournalEntries().entries.length).toBe(1);
  });

  it("builds month-close checklist and posts bonus journal", () => {
    provisionTemp("acct-close-001");
    ensureLedgerDemoChartOfAccounts();
    seedLedgerDemoYear({ fiscalYear: "FY2026", force: true });
    lockMonth({ month: "2026-04", lockedBy: "OP-TEST" });
    const checklist = buildMonthCloseChecklist("2026-04");
    expect(checklist.items.some((row) => row.id === "period-locked" && row.pass)).toBe(
      true,
    );
    const run = computeBonusDraft({ period: "2026-12", grossYen: 400_000 });
    saveBonusDraft(run);
    const posted = postBonusDraftJournal({
      runId: run.run_id,
      authorizedBy: "OP-TEST",
    });
    expect(posted.entry_id).toMatch(/^JE-BONUS-/);
  });

  it("accounting readiness module scores and exposes accounting mode", () => {
    workspace = mkdtempSync(join(tmpdir(), "acct-ready-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const report = buildAccountingReadinessReport();
    expect(report.mode).toBe("accounting");
    expect(report.max_score).toBe(100);
    expect(report.checks.find((row) => row.id === "accounting-module")?.pass).toBe(
      true,
    );
    expect(report.checks.find((row) => row.id === "coa-seed-resolve")?.pass).toBe(
      true,
    );
    expect(existsSync(join(getInstallRoot(), "src/lib/product/ledger-bank-e2e.ts"))).toBe(
      true,
    );
  });
});
