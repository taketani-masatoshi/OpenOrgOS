#!/usr/bin/env node
/**
 * Tiered test runner — contract → platform → catalog → integration.
 * Usage:
 *   npm run test:tiered
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
  listIntegrationTests,
  listPlatformDomainsInLayerOrder,
  listTestsByAxis,
  listTestsByDomain,
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

function main(): number {
  const registry = loadTestRegistry();
  const bail = tier === "tiered";

  if (tier === "contract") {
    return runVitest(
      [...listTestsByAxis("contract", registry), ...listTestsByAxis("meta", registry)],
      "contract"
    );
  }

  if (tier === "platform") {
    if (arg) {
      const domain = arg as PlatformDomainId;
      return runVitest(listTestsByDomain(domain, registry), `platform:${domain}`);
    }
    let code = 0;
    for (const domain of listPlatformDomainsInLayerOrder(registry)) {
      code = runTier(`platform:${domain}`, listTestsByDomain(domain, registry), false);
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
    clearTestSuiteStatus();
    const steps: [string, string[]][] = [
      ["contract", [...listTestsByAxis("contract", registry), ...listTestsByAxis("meta", registry)]],
      ["platform", []],
      ["catalog", listTestsByAxis("catalog", registry)],
      ["integration", listIntegrationTests(registry)],
    ];

    for (const [label, files] of steps) {
      if (label === "platform") {
        for (const domain of listPlatformDomainsInLayerOrder(registry)) {
          const code = runTier(`platform:${domain}`, listTestsByDomain(domain, registry), bail);
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
