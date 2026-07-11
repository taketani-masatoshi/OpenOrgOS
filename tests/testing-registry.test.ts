import { describe, expect, it } from "vitest";
import {
  assertAllTestsRegistered,
  assertAxisCountsMatchTotal,
  assertCatalogFileMapCoversReadiness,
  assertCatalogModuleRegistryBidirectional,
  assertCatalogModuleTestCoverage,
  assertCatalogModulesCovered,
  assertCatalogSeedValidatorPresent,
  assertCiSuitesOnDisk,
  assertClassificationRuleSetsDisjoint,
  assertPlatformDomainsHaveTests,
  assertTieredExecutionDisjoint,
  assertTierPartitionComplete,
  buildRegistryFromDisk,
  countCatalogByCoverageTier,
  countStaticTestCases,
  countTieredExecutionFiles,
  listTestFilesOnDisk,
  loadTestRegistry,
  listTestsForCiSuite,
} from "./test-registry.js";

describe("testing registry", () => {
  it("maps every tests/*.test.ts file", () => {
    const disk = listTestFilesOnDisk();
    const registry = loadTestRegistry();
    expect(Object.keys(registry.tests).length).toBe(disk.length);
    const result = assertAllTestsRegistered(registry);
    expect(result.missingInRegistry, result.missingInRegistry.join(", ")).toEqual([]);
    expect(result.missingOnDisk, result.missingOnDisk.join(", ")).toEqual([]);
    expect(result.staleClassifications, result.staleClassifications.join("\n")).toEqual([]);
  });

  it("partitions all files across taxonomy axes", () => {
    const issues = assertTierPartitionComplete();
    expect(issues, issues.join(", ")).toEqual([]);
    const ruleIssues = assertClassificationRuleSetsDisjoint();
    expect(ruleIssues, ruleIssues.join(", ")).toEqual([]);
  });

  it("axis counts sum to vitest_total", () => {
    const issues = assertAxisCountsMatchTotal();
    expect(issues, issues.join(", ")).toEqual([]);
  });

  it("tiered execution is disjoint and equals vitest_total", () => {
    const registry = loadTestRegistry();
    const issues = assertTieredExecutionDisjoint(registry);
    expect(issues, issues.join("\n")).toEqual([]);
    expect(countTieredExecutionFiles(registry)).toBe(registry.stats.vitest_total);
    expect(registry.stats.tiered_execution_total).toBe(registry.stats.vitest_total);
  });

  it("covers every catalog module with on-disk tests", () => {
    const issues = assertCatalogModulesCovered();
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("catalog_modules and tests.catalog_ids are bidirectional", () => {
    const issues = assertCatalogModuleRegistryBidirectional();
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("derives catalog_modules from readiness + buildCatalogFileMap + MODULE_CLI_BUNDLES", () => {
    const issues = assertCatalogModuleTestCoverage();
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("maps every readiness module to at least one catalog test file", () => {
    const issues = assertCatalogFileMapCoversReadiness();
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("requires seed/validate.ts for every catalog_only module", () => {
    const registry = loadTestRegistry();
    const issues: string[] = [];
    for (const [id, mod] of Object.entries(registry.catalog_modules)) {
      if (mod.coverage_tier !== "catalog_only") continue;
      const issue = assertCatalogSeedValidatorPresent(id);
      if (issue) issues.push(issue);
    }
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("assigns platform-axis tests to every platform domain", () => {
    const issues = assertPlatformDomainsHaveTests();
    expect(issues, issues.join(", ")).toEqual([]);
  });

  it("lists all CI suite files on disk and in registry", () => {
    const issues = assertCiSuitesOnDisk();
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("has zero catalog coverage gaps", () => {
    const registry = loadTestRegistry();
    expect(registry.stats.catalog_gap).toBe(0);
  });

  it("catalog coverage tier stats match catalog_modules", () => {
    const registry = loadTestRegistry();
    expect(countCatalogByCoverageTier(registry.catalog_modules)).toEqual({
      catalog_gap: registry.stats.catalog_gap,
      catalog_dedicated: registry.stats.catalog_dedicated,
      catalog_bundled: registry.stats.catalog_bundled,
      catalog_only: registry.stats.catalog_only,
    });
  });

  it("matches vitest_total and static_test_cases stats", () => {
    const registry = loadTestRegistry();
    expect(registry.stats.vitest_total).toBe(listTestFilesOnDisk().length);
    expect(registry.stats.static_test_cases).toBe(countStaticTestCases());
  });

  it("declares 30 catalog modules aligned with readiness.yaml", () => {
    const registry = loadTestRegistry();
    expect(Object.keys(registry.catalog_modules).length).toBe(30);
    expect(registry.stats.catalog_total).toBe(30);
  });

  it("built registry from disk matches committed yaml", () => {
    const built = buildRegistryFromDisk();
    const loaded = loadTestRegistry();
    expect(Object.keys(built.tests).sort()).toEqual(Object.keys(loaded.tests).sort());
    for (const file of Object.keys(built.tests)) {
      expect(loaded.tests[file]).toEqual(built.tests[file]);
    }
    expect(built.stats).toEqual(loaded.stats);
    expect(built.catalog_modules).toEqual(loaded.catalog_modules);
  });

  it("security-rbac CI suite files exist on disk", () => {
    const files = listTestsForCiSuite("security-rbac");
    expect(files.length).toBe(11);
    for (const f of files) {
      expect(listTestFilesOnDisk()).toContain(f);
    }
  });

  it("wire-gateway-smoke CI suite includes governance tests", () => {
    const files = listTestsForCiSuite("wire-gateway-smoke");
    expect(files).toContain("wire-trust-registry-governance.test.ts");
    expect(files).toContain("wire-node-pk-did-governance.test.ts");
    expect(files.length).toBe(26);
  });

  it("steward-chat-smoke CI suite has 28 vitest files", () => {
    const files = listTestsForCiSuite("steward-chat-smoke");
    expect(files.length).toBe(28);
  });
});
