import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAgentSummaryBody } from "../src/lib/agent-inbox.js";
import { buildAnalyticsDashboardPayload } from "../src/lib/canvas-views/builders/analytics-dashboard.js";
import { writeContractsDigest } from "../src/lib/contracts/contracts-digest.js";
import {
  loadContractsDigestSlot,
  loadSalesDigestSlot,
  loadTaxDigestSlot,
} from "../src/lib/static-report-slot.js";
import { writeSalesDigest } from "../src/lib/sales/sales-digest.js";
import { writeTaxDigest } from "../src/lib/tax/tax-digest.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDocsDir, getDocsReportsDir } from "../src/lib/utils.js";

describe("static CLI digests", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  afterEach(() => {
    for (const sub of ["tax", "contracts", "sales"]) {
      const dir = join(getDocsReportsDir(), sub);
      if (!existsSync(dir)) continue;
      for (const name of ["tax-digest-2099-01-02.md", "status-2099-01-02.md", "digest-2099-01-02.md"]) {
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
    const tax = writeTaxDigest({ today: "2099-01-02" });
    expect(tax.path).toMatch(/tax-digest-2099-01-02\.md$/);
    expect(tax.markdown).toMatch(/税務ダイジェスト/);
    const taxSlot = loadTaxDigestSlot();
    expect(taxSlot.markdown).toContain("税務ダイジェスト");
    expect(taxSlot.generate_hint).toContain("orgos tax digest");

    const contracts = writeContractsDigest({ asOf: "2099-01-02" });
    expect(contracts.path).toMatch(/status-2099-01-02\.md$/);
    const contractSlot = loadContractsDigestSlot();
    expect(contractSlot.markdown).toBeTruthy();
    expect(contractSlot.generate_hint).toContain("orgos contracts digest");

    const sales = writeSalesDigest({ asOf: "2099-01-02" });
    expect(sales.path).toMatch(/digest-2099-01-02\.md$/);
    expect(sales.markdown).toMatch(/営業ダイジェスト/);
    const salesSlot = loadSalesDigestSlot();
    expect(salesSlot.markdown).toContain("営業ダイジェスト");
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
});
