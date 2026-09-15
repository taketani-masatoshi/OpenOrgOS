import { describe, expect, it } from "vitest";
import { writeFinancialAuditWorkpapers } from "../src/lib/finance/financial-audit-workpapers.js";
import { assessEntityModuleMismatches } from "../src/lib/finance/entity-module-guards.js";
import { setTenantId } from "../src/lib/tenant.js";
import { readFileSync } from "node:fs";

describe("financial audit workpapers", () => {
  it("writes index with five assertions for fixture sole prop", () => {
    setTenantId("_fixture-sole-prop");
    const result = writeFinancialAuditWorkpapers("2026");
    expect(result.assertions).toEqual([
      "existence",
      "completeness",
      "valuation",
      "cut_off",
      "presentation",
    ]);
    expect(result.paths.length).toBeGreaterThanOrEqual(2);
    const index = readFileSync(result.paths[0]!, "utf-8");
    expect(index).toContain("外部会計監査人");
    expect(index).toContain("実在性");
  });
});

describe("entity module guards", () => {
  it("does not warn for klab sole prop without corporate tax module", () => {
    setTenantId("klab");
    const warnings = assessEntityModuleMismatches();
    expect(warnings.some((w) => w.includes("jp_tax_corporate"))).toBe(false);
  });
});
