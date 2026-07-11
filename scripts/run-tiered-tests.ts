#!/usr/bin/env node
/**
 * Tiered test runner — contract → platform → catalog → integration.
 * Usage:
 *   npm run test:tiered
 *   npm run test:tiered:verify   (partition checks only — no vitest)
 *   npm run test:contract
 *   npm run test:platform [-- P04_wire_stack]
 *   npm run test:catalog
 *   npm run test:integration
 */
import { spawnSync } from "node:child_process";
import {
  clearTestSuiteStatus,
  writeTestSuiteFailed,
  writeTestSuitePassed,
} from "../src/lib/protocol/test-suite-status.js";
import {
  assertAllTestsRegistered,
  assertAxisCountsMatchTotal,
  assertCatalogFileMapCoversReadiness,
  assertCatalogModuleRegistryBidirectional,
  assertCatalogModuleTestCoverage,
  assertCatalogModulesCovered,
  assertCiSuitesOnDisk,
  assertClassificationRuleSetsDisjoint,
  assertPlatformDomainsHaveTests,
  assertTieredExecutionDisjoint,
  assertTierPartitionComplete,
  countTieredExecutionFiles,
  listIntegrationTests,
  listPlatformDomainsInLayerOrder,
  listTestsByAxis,
  listTestsByPlatformAxis,
  listTestsByPlatformDomain,
  loadTestRegistry,
  type PlatformDomainId,
} from "../tests/test-registry.js";

const tier = process.argv[2] ?? "tiered";
const arg = process.argv[3];

function runVitest(files: string[], label: string): number {
  if (files.length === 0) {
    console.log(`[test:${label}] no files — skip`);
    return 0;
  }
  console.log(`[test:${label}] ${files.length} file(s)`);
  const result = spawnSync("npx", ["vitest", "run", ...files], {
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

function runTier(label: string, files: string[], bail: boolean): number {
  const code = runVitest(files, label);
  if (code !== 0 && bail) {
    console.error(`[test:tiered] stopped at ${label} (exit ${code})`);
  }
  return code;
}

function verifyRegistryPlan(): number {
  const registry = loadTestRegistry();
  const checks: Array<[string, string[]]> = [
    ["tier partition", assertTierPartitionComplete(registry)],
    ["classification rules", assertClassificationRuleSetsDisjoint()],
    ["axis counts", assertAxisCountsMatchTotal(registry)],
    ["tiered execution disjoint", assertTieredExecutionDisjoint(registry)],
    ["catalog modules", assertCatalogModulesCovered(registry)],
    ["catalog bidirectional", assertCatalogModuleRegistryBidirectional(registry)],
    ["catalog derived", assertCatalogModuleTestCoverage(registry)],
    ["catalog file map", assertCatalogFileMapCoversReadiness()],
    ["platform domains", assertPlatformDomainsHaveTests(registry)],
    ["ci suites", assertCiSuitesOnDisk(registry)],
  ];
  const register = assertAllTestsRegistered(registry);
  if (register.missingInRegistry.length) {
    checks.push(["missing in registry", register.missingInRegistry]);
  }
  if (register.staleClassifications.length) {
    checks.push(["stale classifications", register.staleClassifications]);
  }

  let failed = false;
  for (const [label, issues] of checks) {
    if (issues.length === 0) {
      console.log(`[test:tiered:verify] OK ${label}`);
      continue;
    }
    failed = true;
    console.error(`[test:tiered:verify] FAIL ${label}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
  }

  const contractFiles = [...listTestsByAxis("contract", registry), ...listTestsByAxis("meta", registry)];
  const platformFiles = listTestsByPlatformAxis(registry);
  const catalogFiles = listTestsByAxis("catalog", registry);
  const integrationFiles = listIntegrationTests(registry);
  let platformByDomain = 0;
  for (const domain of listPlatformDomainsInLayerOrder(registry)) {
    platformByDomain += listTestsByPlatformDomain(domain, registry).length;
  }
  console.log(
    `[test:tiered:verify] plan: contract/meta=${contractFiles.length} platform=${platformFiles.length} (domain-sum=${platformByDomain}) catalog=${catalogFiles.length} integration=${integrationFiles.length} tiered_total=${countTieredExecutionFiles(registry)} vitest_total=${registry.stats.vitest_total}`
  );

  return failed ? 1 : 0;
}

function main(): number {
  const registry = loadTestRegistry();
  const bail = tier === "tiered";

  if (tier === "verify") {
    return verifyRegistryPlan();
  }

  if (tier === "contract") {
    return runVitest(
      [...listTestsByAxis("contract", registry), ...listTestsByAxis("meta", registry)],
      "contract"
    );
  }

  if (tier === "platform") {
    if (arg) {
      const domain = arg as PlatformDomainId;
      return runVitest(listTestsByPlatformDomain(domain, registry), `platform:${domain}`);
    }
    let code = 0;
    for (const domain of listPlatformDomainsInLayerOrder(registry)) {
      code = runTier(`platform:${domain}`, listTestsByPlatformDomain(domain, registry), false);
      if (code !== 0) return code;
    }
    return code;
  }

  if (tier === "catalog") {
    return runVitest(listTestsByAxis("catalog", registry), "catalog");
  }

  if (tier === "integration") {
    return runVitest(listIntegrationTests(registry), "integration");
  }

  if (tier === "tiered") {
    const verifyCode = verifyRegistryPlan();
    if (verifyCode !== 0) return verifyCode;

    clearTestSuiteStatus();
    const contractFiles = [...listTestsByAxis("contract", registry), ...listTestsByAxis("meta", registry)];
    const catalogFiles = listTestsByAxis("catalog", registry);
    const integrationFiles = listIntegrationTests(registry);
    const platformFiles = listTestsByPlatformAxis(registry);
    console.log(
      `[test:tiered] plan: contract/meta=${contractFiles.length} platform=${platformFiles.length} catalog=${catalogFiles.length} integration=${integrationFiles.length} tiered_total=${countTieredExecutionFiles(registry)}`
    );
    const steps: [string, string[]][] = [
      ["contract", contractFiles],
      ["platform", []],
      ["catalog", catalogFiles],
      ["integration", integrationFiles],
    ];

    for (const [label, files] of steps) {
      if (label === "platform") {
        for (const domain of listPlatformDomainsInLayerOrder(registry)) {
          const code = runTier(`platform:${domain}`, listTestsByPlatformDomain(domain, registry), bail);
          if (code !== 0) {
            writeTestSuiteFailed("npm run test:tiered");
            return code;
          }
        }
        continue;
      }
      const code = runTier(label, files, bail);
      if (code !== 0) {
        writeTestSuiteFailed("npm run test:tiered");
        return code;
      }
    }

    writeTestSuitePassed("npm run test:tiered", registry.stats.vitest_total);
    return 0;
  }

  console.error(`Unknown tier: ${tier}`);
  return 1;
}

process.exit(main());
