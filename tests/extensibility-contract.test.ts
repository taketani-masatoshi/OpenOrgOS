import { describe, expect, it } from "vitest";
import {
  computeModuleAxisStats,
  validateExtensibilityContracts,
} from "../src/lib/extensibility-contract.js";
import { listCatalogModuleIds } from "../src/lib/modules.js";
import { getModuleTier } from "../src/lib/module-readiness.js";

describe("extensibility contract", () => {
  it("passes all cross-layer invariants", () => {
    const issues = validateExtensibilityContracts();
    expect(issues, issues.map((i) => i.message).join("; ")).toEqual([]);
  });

  it("readiness tiers cover full catalog", () => {
    const stats = computeModuleAxisStats();
    expect(stats.catalogTotal).toBe(listCatalogModuleIds().length);
    expect(stats.catalogTotal).toBeGreaterThanOrEqual(26);
    expect(stats.productionReady + stats.activationReady + stats.skeleton).toBe(stats.catalogTotal);
  });

  it("module axis stats match readiness.yaml", () => {
    const stats = computeModuleAxisStats();
    const manualProduction = listCatalogModuleIds().filter(
      (id) => getModuleTier(id) === "production_ready"
    ).length;
    expect(stats.productionReady).toBe(manualProduction);
    expect(stats.productionPct).toBe(Math.round((manualProduction / stats.catalogTotal) * 100));
  });
});
