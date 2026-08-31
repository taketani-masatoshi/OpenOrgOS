/**
 * OrgOS test taxonomy — 3-axis registry (catalog · platform · integration).
 * Canonical data: tests/test-registry.yaml
 * Regenerate: npm run test:registry:sync
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { globFilesSync } from "../src/lib/glob-files.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import { getModuleSeedDir } from "../src/lib/modules.js";

export type TestAxis = "catalog" | "platform" | "contract" | "integration" | "meta";
export type TestKind = "unit" | "server" | "contract" | "integration" | "meta" | "bundled" | "shared-state";
export type CoverageTier = "full" | "dedicated" | "bundled" | "catalog_only" | "partial" | "gap";

export type PlatformDomainId =
  | "P01_kernel"
  | "P02_business_data"
  | "P03_correspondence_org"
  | "P04_wire_stack"
  | "P05_console_layer"
  | "P06_agent_workflow";

export type IntegrationTier = "I1_cli" | "I2_protocol_e2e" | "I3_workflow" | "I4_evidence";

export interface TestEntry {
  file: string;
  axis: TestAxis;
  kind: TestKind;
  domain?: PlatformDomainId;
  integration?: IntegrationTier;
  catalog_ids?: string[];
}

export interface CatalogModuleEntry {
  tier: string;
  coverage_tier: CoverageTier;
  cli: boolean;
  tests: string[];
}

export interface PlatformDomainEntry {
  layer: number;
  ci_suite?: string;
}

export interface CiSuiteEntry {
  files: string[];
  source: string;
}

export interface TestRegistry {
  version: number;
  stats: {
    vitest_total: number;
    static_test_cases: number;
    tiered_execution_total: number;
    catalog_total: number;
    catalog_cli_registered: number;
    catalog_gap: number;
    catalog_dedicated: number;
    catalog_bundled: number;
    catalog_only: number;
  };
  platform_domains: Record<PlatformDomainId, PlatformDomainEntry>;
  catalog_modules: Record<string, CatalogModuleEntry>;
  ci_suites: Record<string, CiSuiteEntry>;
  tests: Record<string, Omit<TestEntry, "file">>;
}

const REGISTRY_DIR = dirname(fileURLToPath(import.meta.url));
export const TEST_REGISTRY_PATH = join(REGISTRY_DIR, "test-registry.yaml");
const READINESS_PATH = join(REGISTRY_DIR, "../steward/modules/readiness.yaml");

let catalogFileMapCache: Record<string, string[]> | null = null;

function parseCatalogIdsFromTestFile(relativePath: string): string[] {
  const body = readFileSync(join(REGISTRY_DIR, relativePath), "utf-8");
  const annotated = body.match(/@catalog-ids:[ \t]*([a-z0-9_, -]+)/i)?.[1];
  if (annotated) {
    return annotated
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  const fromDescribe = body.match(/describeCatalogModule\(["']([^"']+)["']\)/)?.[1];
  if (fromDescribe) return [fromDescribe];
  const ids = [...body.matchAll(/loadModuleManifest\(["']([^"']+)["']\)/g)].map((m) => m[1]);
  const fileStem = relativePath.replace(/^catalog\//, "").replace(/\.test\.ts$/, "");
  return [...new Set(ids)].filter((id) => fileStem === id.replace(/_/g, "-"));
}

/** Build catalog_id → test files from test-local metadata and direct module references. */
export function buildCatalogFileMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const file of listTestFilesOnDisk()) {
    const ids = parseCatalogIdsFromTestFile(file);
    if (ids.length === 0) continue;
    map[file] = ids;
  }
  return map;
}

function getCatalogFileMap(): Record<string, string[]> {
  if (!catalogFileMapCache) catalogFileMapCache = buildCatalogFileMap();
  return catalogFileMapCache;
}

export function assertCatalogFileMapCoversReadiness(map = buildCatalogFileMap()): string[] {
  const readiness = YAML.parse(readFileSync(READINESS_PATH, "utf-8")) as {
    modules: Record<string, { tier: string }>;
  };
  const covered = new Set<string>();
  for (const ids of Object.values(map)) {
    for (const id of ids) covered.add(id);
  }
  const issues: string[] = [];
  for (const id of Object.keys(readiness.modules)) {
    if (!covered.has(id)) issues.push(`${id}: no catalog test file maps to this module`);
  }
  return issues.sort();
}

export function assertCatalogSeedValidatorPresent(catalogId: string): string | null {
  const validatorPath = join(getModuleSeedDir(catalogId), "validate.ts");
  return existsSync(validatorPath) ? null : `${catalogId}: missing seed/validate.ts`;
}

const CONTRACT_FILES = new Set([
  "agent-activation-contract.test.ts",
  "agent-readiness-profiles.test.ts",
  "legacy-webhook-sunset.test.ts",
  "extensibility-contract.test.ts",
  "modules.test.ts",
  "readiness.test.ts",
  "module-production-tier.test.ts",
  "testing-registry.test.ts",
]);

const META_FILES = new Set([
  "framework-backlog.test.ts",
  "os100.test.ts",
  "os-score.test.ts",
  "maturity.test.ts",
  "orgos-readiness.test.ts",
  "test-suite-status.test.ts",
  "docs-score-sync.test.ts",
  "testing-modules-doc-sync.test.ts",
  "tjs-11-progress.test.ts",
  "folder-housekeeping.test.ts",
  "package-release.test.ts",
  "portability-assessment.test.ts",
  "community-readiness.test.ts",
  "eco-production-evidence.test.ts",
  "tenant-registry-coverage.test.ts",
  "tenant-agent-roster-coverage.test.ts",
  "agent-pipeline-check.test.ts",
  "tenant-roster-fixtures.test.ts",
]);

const INTEGRATION_I1 = new Set([
  "skeleton.test.ts",
  "demo-validate.test.ts",
  "acme-validate.test.ts",
  "cli-branding.test.ts",
  "demo-status.test.ts",
]);

const INTEGRATION_I2 = new Set([
  "protocol-witness-integration.test.ts",
  "wire-relay-e2e.test.ts",
  "three-org-wire-demo.test.ts",
  "wire-gateway-outbound-e2e.test.ts",
  "protocol-deliver-pull.test.ts",
  "standalone-org-demo.test.ts",
  "protocol-relay-org-c.test.ts",
  "protocol-mesh-deliver.test.ts",
]);

const INTEGRATION_I3 = new Set([
  "escalate.test.ts",
  "phase2.test.ts",
  "phase3.test.ts",
  "routing.test.ts",
  "queue-audit-bridge.test.ts",
  "bank-corporate-cashflow-pipeline-integration.test.ts",
  "customer-journey-http.test.ts",
]);

const INTEGRATION_I4 = new Set([
  "mal-wire-peer-deliver.test.ts",
  "mal-wire-pilot-gate.test.ts",
  "mal-peers-trust-registry.test.ts",
]);

const SHARED_STATE_FILES = new Set([
  ...INTEGRATION_I3,
  "company-events.test.ts",
  "company-events-chain.test.ts",
  "company-events-cli.test.ts",
  "company-events-lifecycle.test.ts",
  "company-events-attestation.test.ts",
  "company-events-wire-void.test.ts",
  "company-events-abnormal.test.ts",
  "company-events-lint.test.ts",
]);

function isIntegrationFile(base: string): IntegrationTier | undefined {
  if (INTEGRATION_I1.has(base)) return "I1_cli";
  if (INTEGRATION_I2.has(base)) return "I2_protocol_e2e";
  if (INTEGRATION_I3.has(base)) return "I3_workflow";
  if (INTEGRATION_I4.has(base)) return "I4_evidence";
  if (base.includes("-integration") || base.endsWith("-e2e.test.ts")) return "I2_protocol_e2e";
  if (base.endsWith("-demo.test.ts")) return "I4_evidence";
  return undefined;
}

export function assertClassificationRuleSetsDisjoint(): string[] {
  const groups: Array<[string, ReadonlySet<string>]> = [
    ["contract", CONTRACT_FILES],
    ["meta", META_FILES],
    ["I1", INTEGRATION_I1],
    ["I2", INTEGRATION_I2],
    ["I3", INTEGRATION_I3],
    ["I4", INTEGRATION_I4],
  ];
  const owners = new Map<string, string>();
  const issues: string[] = [];
  for (const [group, files] of groups) {
    for (const file of files) {
      const previous = owners.get(file);
      if (previous) issues.push(`${file}: classification rule appears in ${previous} and ${group}`);
      else owners.set(file, group);
    }
  }
  return issues.sort();
}

function classifyPlatformDomain(base: string): PlatformDomainId {
  if (
    /^(protocol-|wire-|hub-|gov-gateway-|openorg-did|peers-|trusted-|relay-|mal-wire-|mal-peers-)/.test(
      base
    )
  ) {
    return "P04_wire_stack";
  }
  if (/^(steward-chat-|wire-console-|mcp-|chat-|session-persist|rate-limit|csrf-|prod-auth-|prod-startup|prod-wire-|notifications-push|sanitize-output|security-validate|theme-)/.test(base)) {
    return "P05_console_layer";
  }
  if (/^(operator-|agent-|shell-|portability-|escalate|routing|phase2|phase3|queue-audit)/.test(base)) {
    return "P06_agent_workflow";
  }
  if (
    /^(correspondence-|mail-config-parse|mail-compose-url|executive-|secretary-|peer-contact-|org-)/.test(
      base
    )
  ) {
    return "P03_correspondence_org";
  }
  if (
    /^(company-events-|finance-|broker|invoice|lib\.|yojitsu-|demo-validate|acme-validate|tenant-|classification|integrations-|dashboard|map\.|io\.|deps\.|skill-registry|skills-cli|modules\.|module-production|context-manifest|agent-summaries|validate-protocol|tenant-document|tenant-setup|tenant-guard|regulations|standards|compliance-|control-framework|wave-modules|travel-|language-bridge|venture-|jp-|readiness|extensibility|skeleton|skill-registry|skills-cli|mail-compose|customer-ux-|customer-journey-|ledger-product|commercial-readiness|accounting-bank-|accounting-readiness|stripe-|ledger-guest|ledger-offboard|ledger-mail|productability)/.test(
      base
    )
  ) {
    if (/^jp-/.test(base) && !base.startsWith("jurisdiction")) {
      return "P02_business_data";
    }
    if (/^(company-events-|finance-|broker|invoice|lib\.|yojitsu-|demo-validate|acme-validate|tenant-|dashboard|map\.|io\.|deps\.|validate-protocol|tenant-document|tenant-setup|tenant-guard|pmo-)/.test(base)) {
      return "P02_business_data";
    }
  }
  if (
    /^(integrity|audit\.|locale|regulations|standards|compliance-|control-framework|iso-|classification|jurisdiction|jurisdiction-|skill-registry|skills-cli|context-manifest|integrations-schema|integrations-status|mail-compose|approver-registry)/.test(
      base
    )
  ) {
    return "P01_kernel";
  }
  if (/^(company-events-|finance-|broker|invoice|lib\.|yojitsu-|tenant-|dashboard|map\.|io\.|deps\.|pmo-)/.test(base)) {
    return "P02_business_data";
  }
  if (/^(org-|correspondence-|executive-|secretary-|peer-contact-|mail-)/.test(base)) {
    return "P03_correspondence_org";
  }
  if (/^(protocol-|wire-|hub-|gov-gateway-)/.test(base)) {
    return "P04_wire_stack";
  }
  if (/^(steward-chat-|wire-console-|mcp-|chat-|operator-|agent-|shell-)/.test(base)) {
    return "P05_console_layer";
  }
  return "P01_kernel";
}

function inferKind(base: string, axis: TestAxis, integration?: IntegrationTier): TestKind {
  if (axis === "contract") return "contract";
  if (axis === "meta") return "meta";
  if (axis === "integration") return "integration";
  if (axis === "catalog" && base === "wave-modules-cli.test.ts") return "bundled";
  if (SHARED_STATE_FILES.has(base)) return "shared-state";
  if (/^(steward-chat-|wire-console-|mcp-http|protocol-api-|protocol-webhook-server|hub-server|wire-gateway-server)/.test(base)) {
    return "server";
  }
  if (integration) return "integration";
  return "unit";
}

/** Rule-based classification for a test filename (used by sync + validation). */
export function classifyTestFile(filename: string): TestEntry {
  const base = filename.endsWith(".test.ts") ? filename : `${filename}.test.ts`;

  if (CONTRACT_FILES.has(base)) {
    return { file: base, axis: "contract", kind: "contract" };
  }
  if (META_FILES.has(base)) {
    return { file: base, axis: "meta", kind: "meta" };
  }

  const catalogIds = getCatalogFileMap()[base];
  if (catalogIds) {
    return {
      file: base,
      axis: "catalog",
      kind: inferKind(base, "catalog"),
      catalog_ids: [...catalogIds],
    };
  }

  if (/^jp-/.test(base)) {
    return {
      file: base,
      axis: base === "jp-business-capability-catalog.test.ts" ? "contract" : "catalog",
      kind: base === "jp-business-capability-catalog.test.ts" ? "contract" : "unit",
      catalog_ids: base === "jp-business-capability-catalog.test.ts" ? undefined : [],
    };
  }

  const integration = isIntegrationFile(base);
  if (integration) {
    const domain = classifyPlatformDomain(base);
    return {
      file: base,
      axis: "integration",
      kind: "integration",
      domain,
      integration,
    };
  }

  if (/^(wave-modules|travel-|language-bridge|venture-)/.test(base)) {
    return {
      file: base,
      axis: "catalog",
      kind: "unit",
      catalog_ids: [],
    };
  }

  const domain = classifyPlatformDomain(base);
  return {
    file: base,
    axis: "platform",
    kind: inferKind(base, "platform"),
    domain,
  };
}

export function listTestFilesOnDisk(): string[] {
  return globFilesSync("**/*.test.ts", { cwd: REGISTRY_DIR })
    .map((f) => f.replace(/\\/g, "/"))
    .sort();
}

export function loadTestRegistry(): TestRegistry {
  if (!existsSync(TEST_REGISTRY_PATH)) {
    throw new Error(`Missing ${TEST_REGISTRY_PATH} — run npm run test:registry:sync`);
  }
  const raw = readFileSync(TEST_REGISTRY_PATH, "utf-8");
  return YAML.parse(raw) as TestRegistry;
}

export function listTestsByAxis(axis: TestAxis, registry = loadTestRegistry()): string[] {
  return Object.entries(registry.tests)
    .filter(([, e]) => e.axis === axis)
    .map(([file]) => file)
    .sort();
}

/** Platform tier execution set — axis === platform only (excludes integration). */
export function listTestsByPlatformAxis(registry = loadTestRegistry()): string[] {
  return listTestsByAxis("platform", registry);
}

/** Platform tests within a domain — primary `domain` only (tags are metadata; no double-run in tiered). */
export function listTestsByPlatformDomain(domain: PlatformDomainId, registry = loadTestRegistry()): string[] {
  return listTestsByPlatformAxis(registry).filter((file) => registry.tests[file]?.domain === domain);
}

/** All tests whose primary domain matches (includes integration axis for reporting only). */
export function listTestsByDomain(domain: PlatformDomainId, registry = loadTestRegistry()): string[] {
  return Object.entries(registry.tests)
    .filter(([, e]) => e.domain === domain)
    .map(([file]) => file)
    .sort();
}

export function listTestsByCatalogId(catalogId: string, registry = loadTestRegistry()): string[] {
  const fromCatalog = registry.catalog_modules[catalogId]?.tests ?? [];
  const fromTests = Object.entries(registry.tests)
    .filter(([, e]) => e.catalog_ids?.includes(catalogId))
    .map(([file]) => file);
  return [...new Set([...fromCatalog, ...fromTests])].sort();
}

export function listIntegrationTests(registry = loadTestRegistry()): string[] {
  return Object.entries(registry.tests)
    .filter(([, e]) => e.axis === "integration")
    .map(([file]) => file)
    .sort();
}

export function listTestsForCiSuite(suiteId: string, registry = loadTestRegistry()): string[] {
  const suite = registry.ci_suites[suiteId];
  if (!suite) throw new Error(`Unknown CI suite: ${suiteId}`);
  return [...suite.files].sort();
}

export function listPlatformDomainsInLayerOrder(registry = loadTestRegistry()): PlatformDomainId[] {
  return (Object.entries(registry.platform_domains) as [PlatformDomainId, PlatformDomainEntry][])
    .sort((a, b) => a[1].layer - b[1].layer)
    .map(([id]) => id);
}

export interface RegistryAssertResult {
  ok: boolean;
  missingOnDisk: string[];
  extraOnDisk: string[];
  missingInRegistry: string[];
  staleClassifications: string[];
}

function catalogIdsKey(ids?: string[]): string {
  return [...(ids ?? [])].sort().join(",");
}

function classificationDiff(
  file: string,
  entry: Omit<TestEntry, "file">,
  inferred: TestEntry
): string[] {
  const diffs: string[] = [];
  if (inferred.axis !== entry.axis) diffs.push(`axis ${entry.axis} != ${inferred.axis}`);
  if (inferred.kind !== entry.kind) diffs.push(`kind ${entry.kind} != ${inferred.kind}`);
  if (inferred.domain !== entry.domain) diffs.push(`domain ${entry.domain} != ${inferred.domain}`);
  if (inferred.integration !== entry.integration) {
    diffs.push(`integration ${entry.integration} != ${inferred.integration}`);
  }
  if (catalogIdsKey(inferred.catalog_ids) !== catalogIdsKey(entry.catalog_ids)) {
    diffs.push(`catalog_ids [${catalogIdsKey(entry.catalog_ids)}] != [${catalogIdsKey(inferred.catalog_ids)}]`);
  }
  return diffs.map((d) => `${file}: ${d}`);
}

export function countStaticTestCases(): number {
  let total = 0;
  for (const file of listTestFilesOnDisk()) {
    const body = readFileSync(join(REGISTRY_DIR, file), "utf-8");
    total += (body.match(/\b(it|test)\s*\(/g) ?? []).length;
  }
  return total;
}

export function countTieredExecutionFiles(registry = loadTestRegistry()): number {
  const files = [
    ...listTestsByAxis("contract", registry),
    ...listTestsByAxis("meta", registry),
    ...listTestsByPlatformAxis(registry),
    ...listTestsByAxis("catalog", registry),
    ...listIntegrationTests(registry),
  ];
  return new Set(files).size;
}

export function assertTieredExecutionDisjoint(registry = loadTestRegistry()): string[] {
  const groups: Array<[string, string[]]> = [
    ["contract", listTestsByAxis("contract", registry)],
    ["meta", listTestsByAxis("meta", registry)],
    ["platform", listTestsByPlatformAxis(registry)],
    ["catalog", listTestsByAxis("catalog", registry)],
    ["integration", listIntegrationTests(registry)],
  ];
  const owner = new Map<string, string>();
  const issues: string[] = [];
  for (const [label, files] of groups) {
    for (const file of files) {
      const prev = owner.get(file);
      if (prev) issues.push(`${file}: listed in both ${prev} and ${label}`);
      else owner.set(file, label);
    }
  }
  const unionSize = owner.size;
  const axisSum = groups.reduce((n, [, files]) => n + files.length, 0);
  if (unionSize !== axisSum) {
    issues.push(`tiered groups overlap: union ${unionSize} != sum ${axisSum}`);
  }
  if (unionSize !== registry.stats.vitest_total) {
    issues.push(`tiered union ${unionSize} != vitest_total ${registry.stats.vitest_total}`);
  }
  return issues.sort();
}

export function assertCatalogModuleRegistryBidirectional(registry = loadTestRegistry()): string[] {
  const issues: string[] = [];
  for (const [id, mod] of Object.entries(registry.catalog_modules)) {
    for (const testFile of mod.tests) {
      const entry = registry.tests[testFile];
      if (!entry?.catalog_ids?.includes(id)) {
        issues.push(`${id}: catalog_modules lists ${testFile} but tests entry lacks catalog_id`);
      }
    }
  }
  for (const [file, entry] of Object.entries(registry.tests)) {
    for (const id of entry.catalog_ids ?? []) {
      const mod = registry.catalog_modules[id];
      if (!mod) {
        issues.push(`${file}: unknown catalog_id ${id}`);
        continue;
      }
      if (!mod.tests.includes(file)) {
        issues.push(`${id}: ${file} in tests.catalog_ids but not catalog_modules.tests`);
      }
    }
  }
  return issues.sort();
}

export function assertAllTestsRegistered(registry = loadTestRegistry()): RegistryAssertResult {
  const onDisk = new Set(listTestFilesOnDisk());
  const inRegistry = new Set(Object.keys(registry.tests));

  const missingInRegistry = [...onDisk].filter((f) => !inRegistry.has(f)).sort();
  const extraInRegistry = [...inRegistry].filter((f) => !onDisk.has(f)).sort();

  const staleClassifications: string[] = [];
  for (const [file, entry] of Object.entries(registry.tests)) {
    if (!onDisk.has(file)) continue;
    staleClassifications.push(...classificationDiff(file, entry, classifyTestFile(file)));
  }

  return {
    ok: missingInRegistry.length === 0 && extraInRegistry.length === 0 && staleClassifications.length === 0,
    missingOnDisk: extraInRegistry,
    extraOnDisk: missingInRegistry,
    missingInRegistry,
    staleClassifications,
  };
}

export function assertTierPartitionComplete(registry = loadTestRegistry()): string[] {
  const onDisk = new Set(listTestFilesOnDisk());
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const file of Object.keys(registry.tests)) {
    if (seen.has(file)) duplicates.push(file);
    seen.add(file);
  }
  const missing = [...onDisk].filter((f) => !registry.tests[f]).sort();
  const extra = [...seen].filter((f) => !onDisk.has(f)).sort();
  return [...duplicates, ...missing.map((f) => `missing:${f}`), ...extra.map((f) => `extra:${f}`)];
}

export function assertCatalogModulesCovered(registry = loadTestRegistry()): string[] {
  const onDisk = new Set(listTestFilesOnDisk());
  const issues: string[] = [];
  for (const [id, mod] of Object.entries(registry.catalog_modules)) {
    if (mod.coverage_tier === "gap") {
      issues.push(`${id}: coverage_tier gap`);
      continue;
    }
    const files = mod.tests.filter((f) => onDisk.has(f));
    if (files.length === 0) {
      issues.push(`${id}: no test files on disk (${mod.tests.join(", ") || "empty"})`);
    }
  }
  return issues.sort();
}

export function assertPlatformDomainsHaveTests(registry = loadTestRegistry(), minPerDomain = 1): string[] {
  const issues: string[] = [];
  for (const domain of listPlatformDomainsInLayerOrder(registry)) {
    const count = listTestsByPlatformDomain(domain, registry).length;
    if (count < minPerDomain) {
      issues.push(`${domain}: ${count} platform-axis tests (min ${minPerDomain})`);
    }
  }
  return issues;
}

export function assertAxisCountsMatchTotal(registry = loadTestRegistry()): string[] {
  const axes: TestAxis[] = ["catalog", "platform", "contract", "integration", "meta"];
  const byAxis = Object.fromEntries(axes.map((a) => [a, 0])) as Record<TestAxis, number>;
  for (const entry of Object.values(registry.tests)) {
    byAxis[entry.axis] += 1;
  }
  const sum = axes.reduce((n, a) => n + byAxis[a], 0);
  if (sum !== registry.stats.vitest_total) {
    return [`axis sum ${sum} != vitest_total ${registry.stats.vitest_total}`];
  }
  return [];
}

export function assertCiSuitesOnDisk(registry = loadTestRegistry()): string[] {
  const onDisk = new Set(listTestFilesOnDisk());
  const issues: string[] = [];
  for (const [suiteId, suite] of Object.entries(registry.ci_suites)) {
    for (const file of suite.files) {
      if (!onDisk.has(file)) {
        issues.push(`${suiteId}: missing ${file}`);
      }
      if (!registry.tests[file]) {
        issues.push(`${suiteId}: ${file} not in registry.tests`);
      }
    }
  }
  return issues.sort();
}

export function countCatalogByCoverageTier(
  catalog_modules: Record<string, CatalogModuleEntry>
): Pick<TestRegistry["stats"], "catalog_gap" | "catalog_dedicated" | "catalog_bundled" | "catalog_only"> {
  const mods = Object.values(catalog_modules);
  return {
    catalog_gap: mods.filter((m) => m.coverage_tier === "gap").length,
    catalog_dedicated: mods.filter((m) => m.coverage_tier === "dedicated" || m.coverage_tier === "full").length,
    catalog_bundled: mods.filter((m) => m.coverage_tier === "bundled").length,
    catalog_only: mods.filter((m) => m.coverage_tier === "catalog_only").length,
  };
}

export function listTestsForCatalogId(catalogId: string): string[] {
  const files = new Set<string>();
  for (const [file, ids] of Object.entries(getCatalogFileMap())) {
    if (ids.includes(catalogId)) files.add(file);
  }
  return [...files].sort();
}

function readCatalogCoverageMarker(file: string): CoverageTier | undefined {
  const body = readFileSync(join(REGISTRY_DIR, file), "utf-8");
  return body.match(/@catalog-coverage:[ \t]*(full|dedicated|bundled|catalog_only)/)?.[1] as
    | CoverageTier
    | undefined;
}

export function inferCatalogCoverageTier(_catalogId: string, tests: string[]): CoverageTier {
  const markers = tests.map(readCatalogCoverageMarker).filter(Boolean) as CoverageTier[];
  if (markers.includes("full")) return "full";
  if (markers.includes("bundled")) return "bundled";
  if (markers.includes("catalog_only")) return "catalog_only";
  if (
    tests.length === 1 &&
    readFileSync(join(REGISTRY_DIR, tests[0]), "utf-8").includes("describeCatalogModule(")
  ) {
    return "catalog_only";
  }
  return "dedicated";
}

export function assertCatalogModuleTestCoverage(registry = loadTestRegistry()): string[] {
  const issues: string[] = [];
  for (const [id, mod] of Object.entries(registry.catalog_modules)) {
    const expected = listTestsForCatalogId(id);
    const actual = [...mod.tests].sort();
    if (expected.join("|") !== actual.join("|")) {
      issues.push(`${id}: tests [${actual.join(", ")}] != derived map [${expected.join(", ")}]`);
    }
    const inferred = inferCatalogCoverageTier(id, expected);
    if (mod.coverage_tier !== inferred) {
      issues.push(`${id}: coverage_tier ${mod.coverage_tier} != inferred ${inferred}`);
    }
    const cliExpected = listModuleCliBundles().some((b) => b.moduleId === id);
    if (mod.cli !== cliExpected) {
      issues.push(`${id}: cli ${mod.cli} != MODULE_CLI_BUNDLES ${cliExpected}`);
    }
  }
  return issues.sort();
}

export function buildDefaultCatalogModules(): Record<string, CatalogModuleEntry> {
  const readiness = YAML.parse(readFileSync(READINESS_PATH, "utf-8")) as {
    modules: Record<string, { tier: string }>;
  };
  const cliIds = new Set(listModuleCliBundles().map((b) => b.moduleId));
  const modules: Record<string, CatalogModuleEntry> = {};
  for (const id of Object.keys(readiness.modules).sort()) {
    const tests = listTestsForCatalogId(id);
    if (tests.length === 0) {
      throw new Error(`buildCatalogFileMap() has no tests for readiness module: ${id}`);
    }
    modules[id] = {
      tier: readiness.modules[id].tier,
      coverage_tier: inferCatalogCoverageTier(id, tests),
      cli: cliIds.has(id),
      tests,
    };
  }
  return modules;
}

export function buildRegistryFromDisk(): TestRegistry {
  const files = listTestFilesOnDisk();
  const tests: Record<string, Omit<TestEntry, "file">> = {};
  for (const file of files) {
    const { file: _f, ...rest } = classifyTestFile(file);
    tests[file] = rest;
  }

  const catalog_modules = buildDefaultCatalogModules();
  const tierCounts = countCatalogByCoverageTier(catalog_modules);
  const registry: TestRegistry = {
    version: 2,
    stats: {
      vitest_total: files.length,
      static_test_cases: countStaticTestCases(),
      tiered_execution_total: 0,
      catalog_total: Object.keys(catalog_modules).length,
      catalog_cli_registered: listModuleCliBundles().length,
      ...tierCounts,
    },
    platform_domains: {
      P01_kernel: { layer: 1 },
      P02_business_data: { layer: 2 },
      P03_correspondence_org: { layer: 2 },
      P04_wire_stack: { layer: 3, ci_suite: "wire-gateway-smoke" },
      P05_console_layer: { layer: 4, ci_suite: "steward-chat-smoke" },
      P06_agent_workflow: { layer: 4 },
    },
    catalog_modules,
    ci_suites: {
      "security-rbac": {
        source: ".github/workflows/validate.yml",
        files: [
          "operator-rbac.test.ts",
          "cli-operator-auth.test.ts",
          "mcp-rbac.test.ts",
          "org-boundary.test.ts",
          "shell-sandbox.test.ts",
          "prod-auth-checklist.test.ts",
          "security-validate.test.ts",
          "cli-data-write-auth.test.ts",
          "fs-guard.test.ts",
          "tenant-registry-coverage.test.ts",
          "tenant-agent-roster-coverage.test.ts",
          "shell-profile-integrity.test.ts",
        ],
      },
      "wire-gateway-smoke": {
        source: ".github/workflows/validate.yml",
        files: [
          "wire-gateway-server.test.ts",
          "wire-gateway-codec.test.ts",
          "wire-gateway-outbound-e2e.test.ts",
          "wire-gateway-validate.test.ts",
          "wire-gateway-internal-api.test.ts",
          "wire-gateway-init.test.ts",
          "wire-gateway-discover.test.ts",
          "wire-gateway-discover-apply.test.ts",
          "outbox-permissions-gate.test.ts",
          "wire-trust-registry.test.ts",
          "wire-trust-registry-sync.test.ts",
          "wire-trust-registry-governance.test.ts",
          "wire-node-pk-did-governance.test.ts",
          "peers-migrate-legacy.test.ts",
          "gov-gateway-adapter.test.ts",
          "gov-gateway-sandbox.test.ts",
          "gov-gateway-live.test.ts",
          "prod-wire-gate.test.ts",
          "mal-wire-pilot-gate.test.ts",
          "mal-wire-peer-deliver.test.ts",
          "mal-peers-trust-registry.test.ts",
          "wire-relay-e2e.test.ts",
          "wire-gateway-federation-sync.test.ts",
          "relay-sla-alert.test.ts",
          "protocol-relay-worker.test.ts",
          "protocol-witness-integration.test.ts",
        ],
      },
      "steward-chat-smoke": {
        source: "package.json",
        files: [
          "steward-chat-today.test.ts",
          "steward-chat-auth.test.ts",
          "steward-chat-stream.test.ts",
          "steward-chat-events-stream.test.ts",
          "steward-chat-flush.test.ts",
          "chat-thread.test.ts",
          "session-persist.test.ts",
          "operator-dispatch-unified.test.ts",
          "operator-runtime-shell.test.ts",
          "operator-runtime-llm.test.ts",
          "operator-runtime-tools.test.ts",
          "operator-runtime-structured.test.ts",
          "operator-runtime-telemetry.test.ts",
          "mcp-auth-audit.test.ts",
          "mcp-steward.test.ts",
          "mcp-http.test.ts",
          "mcp-abnormal.test.ts",
          "rate-limit.test.ts",
          "prod-auth-checklist.test.ts",
          "prod-startup.test.ts",
          "notifications-push.test.ts",
          "csrf-guard.test.ts",
          "chat-audit.test.ts",
          "chat-rbac.test.ts",
          "steward-chat-witness.test.ts",
          "steward-chat-operator-stats.test.ts",
          "steward-chat-abnormal.test.ts",
          "package-release.test.ts",
        ],
      },
      "wire-console-test": {
        source: "package.json",
        files: [
          "wire-console-server.test.ts",
          "wire-console-human-mail.test.ts",
          "wire-console-redact.test.ts",
          "wire-console-webauthn-verify.test.ts",
          "wire-console-webauthn-register.test.ts",
          "webauthn-origin.test.ts",
        ],
      },
      "scheduling-smoke": {
        source: "package.json",
        files: [
          "doctor-repair-operator.test.ts",
          "operator-registry-cli.test.ts",
          "scheduling-operational-readiness.test.ts",
          "scheduling-rehearsal-cli.test.ts",
          "scheduling-rehearsal-mail-path.test.ts",
          "scheduling-e2e.test.ts",
          "scheduling-mail.test.ts",
          "scheduling-mail-poller.test.ts",
          "scheduling-reminder-poller.test.ts",
          "scheduling-secretary-flow.test.ts",
          "scheduling-state-reliability.test.ts",
        ],
      },
    },
    tests,
  };
  registry.stats.tiered_execution_total = countTieredExecutionFiles(registry);
  return registry;
}
