import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getTenantDir } from "../src/lib/tenant.js";
import {
  ensureFinanceIngestInboxScaffold,
  FINANCE_INGEST_SCAFFOLD_MODULES,
  moduleNeedsFinanceIngestScaffold,
} from "../src/lib/finance/ingest/scaffold.js";

const TENANT = "_fixture-books";

describe("finance ingest scaffold (module standard)", () => {
  afterEach(() => {
    setTenantId(TENANT);
  });

  it("lists corporate and sole-prop modules", () => {
    expect(moduleNeedsFinanceIngestScaffold("jp_sole_proprietor_blue_return")).toBe(true);
    expect(moduleNeedsFinanceIngestScaffold("jp_tax_corporate")).toBe(true);
    expect(moduleNeedsFinanceIngestScaffold("jp_bank_corporate")).toBe(true);
    expect(moduleNeedsFinanceIngestScaffold("jp_financial_audit")).toBe(true);
    expect(moduleNeedsFinanceIngestScaffold("rental")).toBe(false);
    expect(FINANCE_INGEST_SCAFFOLD_MODULES.size).toBeGreaterThanOrEqual(7);
  });

  it("creates inbox category READMEs from platform SSOT", () => {
    setTenantId(TENANT);
    const salesReadme = join(
      getTenantDir(),
      "docs/io/inbox/sales/00-このフォルダについて.md",
    );
    const rulesPath = join(getTenantDir(), "data/finance/ingest-rules.yaml");
    const hadRules = existsSync(rulesPath);
    if (existsSync(salesReadme)) {
      rmSync(salesReadme);
    }

    const result = ensureFinanceIngestInboxScaffold();
    expect(result.dirs_created.some((p) => p.includes("inbox/bank"))).toBe(true);
    expect(existsSync(salesReadme)).toBe(true);

    const again = ensureFinanceIngestInboxScaffold();
    expect(again.readmes_copied).toEqual([]);

    if (!hadRules && existsSync(rulesPath)) {
      rmSync(rulesPath);
    }
  });
});
