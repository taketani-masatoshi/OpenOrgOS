import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAgentSummaryBody } from "../src/lib/agent-inbox.js";
import { buildAnalyticsDashboardPayload } from "../src/lib/canvas-views/builders/analytics-dashboard.js";
import { writeContractsDigest } from "../src/lib/contracts/contracts-digest.js";
import {
  loadBudgetDigestSlot,
  loadContractsDigestSlot,
  loadLedgerDigestSlot,
  loadOrgDigestSlot,
  loadSalesDigestSlot,
  loadTaxDigestSlot,
} from "../src/lib/static-report-slot.js";
import { writeSalesDigest } from "../src/lib/sales/sales-digest.js";
import { writeTaxDigest } from "../src/lib/tax/tax-digest.js";
import { writeLedgerDigest } from "../src/lib/ledger/ledger-digest.js";
import { writeBudgetDigest } from "../src/lib/budget/budget-digest.js";
import { writeOrgDigest } from "../src/lib/org/org-digest.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDocsDir, getDocsReportsDir } from "../src/lib/utils.js";

describe("static CLI digests", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  afterEach(() => {
    for (const sub of ["tax", "contracts", "sales", "ledger", "budget", "org"]) {
      const dir = join(getDocsReportsDir(), sub);
      if (!existsSync(dir)) continue;
      for (const name of [
        "tax-digest-2099-01-02.md",
        "status-2099-01-02.md",
        "digest-2099-01-02.md",
        "weekly-2099-01-02.md",
        "weekly-2099-01-03.md",
      ]) {
        const f = join(dir, name);
        if (existsSync(f)) rmSync(f, { force: true });
      }
    }
  });

  it("analytics payload exposes monthly snapshots and generate_hint", () => {
    const payload = buildAnalyticsDashboardPayload({ expensive: "cached" });
    expect(payload.generate_hint).toContain("orgos analytics snapshot");
    expect(Array.isArray(payload.monthly_snapshots)).toBe(true);
    expect(Array.isArray(payload.annual_snapshots)).toBe(true);
    expect(payload.latest_md.generate_hint).toContain("orgos analytics snapshot");
    if (payload.monthly_snapshots.length > 0) {
      expect(payload.monthly_snapshots[0]).toHaveProperty("month");
      expect(payload.monthly_snapshots[0]).toHaveProperty("attention_count");
    }
  });

  it("reads analytics snapshot md via allowlist", () => {
    const dir = join(getDocsDir(), "analytics", "snapshots");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "2099-01.md");
    writeFileSync(file, "# Analytics test\n\nOK\n", "utf-8");
    try {
      const body = readAgentSummaryBody("docs/analytics/snapshots/2099-01.md");
      expect(body).toContain("Analytics test");
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("writes tax/contracts/sales digests and loads static slots", () => {
    const tax = writeTaxDigest({ today: "2099-01-02", period: "weekly" });
    expect(tax.path).toMatch(/weekly-2099-01-02\.md$/);
    expect(tax.markdown).toMatch(/税務/);
    const taxSlot = loadTaxDigestSlot();
    expect(taxSlot.markdown).toBeTruthy();
    expect(taxSlot.generate_hint).toContain("orgos tax digest");

    const contracts = writeContractsDigest({ asOf: "2099-01-02", period: "weekly" });
    expect(contracts.path).toMatch(/weekly-2099-01-02\.md$/);
    const contractSlot = loadContractsDigestSlot();
    expect(contractSlot.markdown).toBeTruthy();
    expect(contractSlot.generate_hint).toContain("orgos contracts digest");

    const sales = writeSalesDigest({ asOf: "2099-01-02", period: "weekly" });
    expect(sales.path).toMatch(/weekly-2099-01-02\.md$/);
    expect(sales.markdown).toMatch(/営業/);
    const salesSlot = loadSalesDigestSlot();
    expect(salesSlot.markdown).toBeTruthy();
    expect(salesSlot.generate_hint).toContain("orgos sales digest");
  });

  it("allowlists tax/contracts/sales report prefixes", () => {
    const taxDir = join(getDocsReportsDir(), "tax");
    mkdirSync(taxDir, { recursive: true });
    const file = join(taxDir, "tax-digest-2099-01-03.md");
    writeFileSync(file, "# Tax allow\n\nOK\n", "utf-8");
    try {
      expect(readAgentSummaryBody("docs/reports/tax/tax-digest-2099-01-03.md")).toContain(
        "Tax allow",
      );
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("writes ledger/budget/org digests and loads static slots", () => {
    const ledger = writeLedgerDigest({ asOf: "2099-01-02", period: "weekly" });
    expect(ledger.path).toMatch(/weekly-2099-01-02\.md$/);
    expect(ledger.markdown).toMatch(/帳簿週次/);
    const ledgerSlot = loadLedgerDigestSlot();
    expect(ledgerSlot.generate_hint).toContain("orgos ledger digest");

    const budget = writeBudgetDigest({ asOf: "2099-01-02", period: "weekly" });
    expect(budget.path).toMatch(/weekly-2099-01-02\.md$/);
    expect(budget.markdown).toMatch(/予算週次/);
    const budgetSlot = loadBudgetDigestSlot();
    expect(budgetSlot.generate_hint).toContain("orgos budget digest");

    const org = writeOrgDigest({ asOf: "2099-01-02", period: "weekly" });
    expect(org.path).toMatch(/weekly-2099-01-02\.md$/);
    expect(org.markdown).toMatch(/組織週次/);
    const orgSlot = loadOrgDigestSlot();
    expect(orgSlot.generate_hint).toContain("orgos org digest");
  });

  it("allowlists ledger/budget/org report prefixes", () => {
    for (const sub of ["ledger", "budget", "org"] as const) {
      const dir = join(getDocsReportsDir(), sub);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, "weekly-2099-01-03.md");
      writeFileSync(file, `# ${sub} allow\n\nOK\n`, "utf-8");
      try {
        expect(
          readAgentSummaryBody(`docs/reports/${sub}/weekly-2099-01-03.md`),
        ).toContain(`${sub} allow`);
      } finally {
        rmSync(file, { force: true });
      }
    }
  });

});
