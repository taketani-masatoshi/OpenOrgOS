import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths, getInstallRoot } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { seedLedgerDemoYear } from "../src/lib/product/ledger-seed-demo-year.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { importBankStatementCsvText } from "../src/lib/finance/bank-statement-import-service.js";
import { buildTaxHandoffPackage } from "../src/lib/tax/tax-handoff-package.js";
import {
  computeBonusDraft,
  saveBonusDraft,
  buildPayrollYearEndReadiness,
} from "../src/lib/finance/payroll-bonus-yea.js";
import {
  enableDenchoPremium,
  buildDenchoSkuSnapshot,
} from "../src/lib/product/dencho-premium-sku.js";

describe("productability P0–P2", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  function provisionTemp(id: string) {
    workspace = mkdtempSync(join(tmpdir(), "prod-gap-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: id,
      companyName: "Gap KK",
      adminEmail: "ceo@gap.example",
      plan: "business",
    });
    setTenantId(id);
  }

  it("seeds a full demo fiscal year of journals on fixture tenant", () => {
    workspace = mkdtempSync(join(tmpdir(), "prod-gap-fix"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const src = join(getInstallRoot(), "tenants/_fixture-books");
    const dest = join(workspace, "tenants/_fixture-books");
    cpSync(src, dest, { recursive: true });
    setTenantId("_fixture-books");
    // Clear journals first for deterministic seed
    const result = seedLedgerDemoYear({ fiscalYear: "FY2026", force: true });
    expect(result.skipped).toBe(false);
    expect(result.months).toHaveLength(12);
    expect(result.posted_entry_ids.length).toBe(24);
    expect(loadJournalEntries().entries.length).toBeGreaterThanOrEqual(24);
  });

  it("imports bank statement CSV text", () => {
    provisionTemp("bank-csv-001");
    const csv = [
      "date,direction,amount,category,description,account_id",
      "2026-04-01,inflow,100000,rent,April rent,BANK-001",
      "2026-04-02,outflow,30000,office,Office supplies,BANK-001",
    ].join("\n");
    const result = importBankStatementCsvText({ csvText: csv, write: true });
    expect(result.added).toBe(2);
    expect(result.dry_run).toBe(false);
    expect(
      existsSync(join(workspace, "tenants/bank-csv-001/data/finance/bank-statements.yaml")),
    ).toBe(true);
  });

  it("builds tax handoff package without etax submit", () => {
    workspace = mkdtempSync(join(tmpdir(), "prod-gap-tax-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const src = join(getInstallRoot(), "tenants/_fixture-books");
    const dest = join(workspace, "tenants/_fixture-books");
    cpSync(src, dest, { recursive: true });
    setTenantId("_fixture-books");
    seedLedgerDemoYear({ fiscalYear: "FY2026", force: true });
    const pack = buildTaxHandoffPackage({ fiscalYear: "FY2026" });
    expect(pack.submission).toBe("not-for-etax");
    expect(existsSync(pack.zip_path)).toBe(true);
  });

  it("creates bonus draft and dencho premium sku", () => {
    provisionTemp("bonus-001");
    const run = computeBonusDraft({ period: "2026-12", grossYen: 500_000 });
    saveBonusDraft(run);
    expect(run.net_yen).toBeLessThan(run.gross_yen);
    const yea = buildPayrollYearEndReadiness("FY2026");
    expect(yea.module).toBe("jp_payroll");
    enableDenchoPremium({ provider: "stub-tsa" });
    const sku = buildDenchoSkuSnapshot();
    expect(sku.base.included_in_ledger).toBe(true);
    expect(sku.premium.included_in_ledger).toBe(false);
    expect(sku.premium.status).toBe("enabled");
  });
});
