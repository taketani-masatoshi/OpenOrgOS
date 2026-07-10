/**
 * OrgOS test taxonomy — 3-axis registry (catalog · platform · integration).
 * Canonical data: tests/test-registry.yaml
 * Regenerate: npm run test:registry:sync
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export type TestAxis = "catalog" | "platform" | "contract" | "integration" | "meta";
export type TestKind = "unit" | "server" | "contract" | "integration" | "meta" | "bundled" | "shared-state";
export type CoverageTier = "full" | "dedicated" | "bundled" | "partial" | "gap";

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
  tags?: string[];
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
    catalog_total: number;
    catalog_cli_registered: number;
    catalog_gap: number;
  };
  platform_domains: Record<PlatformDomainId, PlatformDomainEntry>;
  catalog_modules: Record<string, CatalogModuleEntry>;
  ci_suites: Record<string, CiSuiteEntry>;
  tests: Record<string, Omit<TestEntry, "file">>;
}

const REGISTRY_DIR = dirname(fileURLToPath(import.meta.url));
export const TEST_REGISTRY_PATH = join(REGISTRY_DIR, "test-registry.yaml");

const WAVE_MODULE_IDS = [
  "professional_services",
  "saas_subscription",
  "property_management",
  "software_outsourcing",
  "real_estate_brokerage",
  "venture_capital",
  "membership",
  "staffing",
  "ecommerce",
  "event_operations",
] as const;

const CATALOG_FILE_MAP: Record<string, string[]> = {
  "travel-booking.test.ts": ["travel_booking"],
  "language-bridge.test.ts": ["language_bridge"],
  "venture-capital.test.ts": ["venture_capital"],
  "wave-modules-cli.test.ts": [...WAVE_MODULE_IDS],
  "jp-permit-registry.test.ts": ["jp_permit_registry"],
  "jp-permit-registry-application.test.ts": ["jp_permit_registry"],
  "jp-corporate-registration.test.ts": ["jp_corporate_registration"],
  "jp-medical-device.test.ts": ["jp_medical_device"],
  "jp-subsidy-application.test.ts": ["jp_subsidy_application"],
  "jp-trademark-application.test.ts": ["jp_trademark_application"],
  "invoice.test.ts": ["rental"],
  "skeleton.test.ts": ["rental", "restaurant"],
};

const CONTRACT_FILES = new Set([
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
  "tjs-11-progress.test.ts",
  "folder-housekeeping.test.ts",
  "package-release.test.ts",
  "portability-assessment.test.ts",
  "community-readiness.test.ts",
  "eco-production-evidence.test.ts",
  "tenant-registry-coverage.test.ts",
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
]);

const INTEGRATION_I4 = new Set([
  "eco-production-evidence.test.ts",
  "standalone-org-demo.test.ts",
  "three-org-wire-demo.test.ts",
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

function classifyPlatformDomain(base: string): PlatformDomainId {
  if (
    /^(protocol-|wire-|hub-|gov-gateway-|openorg-did|peers-|trusted-|relay-|mal-wire-|mal-peers-)/.test(
      base
    )
  ) {
    return "P04_wire_stack";
  }
  if (/^(steward-chat-|wire-console-|mcp-|chat-|session-persist|rate-limit|csrf-|prod-auth-|prod-startup|prod-wire-|notifications-push|sanitize-output|security-validate)/.test(base)) {
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
    /^(company-events-|finance-|broker|invoice|lib\.|yojitsu-|demo-validate|acme-validate|tenant-|classification|integrations-|dashboard|map\.|io\.|deps\.|skill-registry|skills-cli|modules\.|module-production|context-manifest|agent-summaries|validate-protocol|tenant-document|tenant-setup|tenant-guard|regulations|standards|compliance-|control-framework|wave-modules|travel-|language-bridge|venture-|jp-|readiness|extensibility|skeleton|skill-registry|skills-cli|mail-compose)/.test(
      base
    )
  ) {
    if (/^jp-/.test(base) && !base.startsWith("jurisdiction")) {
      return "P02_business_data";
    }
    if (/^(company-events-|finance-|broker|invoice|lib\.|yojitsu-|demo-validate|acme-validate|tenant-|dashboard|map\.|io\.|deps\.|validate-protocol|tenant-document|tenant-setup|tenant-guard)/.test(base)) {
      return "P02_business_data";
    }
  }
  if (
    /^(integrity|audit\.|locale|regulations|standards|compliance-|control-framework|classification|jurisdiction|jurisdiction-|skill-registry|skills-cli|context-manifest|integrations-schema|integrations-status|mail-compose|approver-registry)/.test(
      base
    )
  ) {
    return "P01_kernel";
  }
  if (/^(company-events-|finance-|broker|invoice|lib\.|yojitsu-|tenant-|dashboard|map\.|io\.|deps\.)/.test(base)) {
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

  const catalogIds = CATALOG_FILE_MAP[base];
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
      tags: integration === "I2_protocol_e2e" ? [domain] : undefined,
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
  const tags: string[] = [];
  if (base === "protocol-email-wire-deliver.test.ts") {
    tags.push("P03_correspondence_org");
  }

  return {
    file: base,
    axis: "platform",
    kind: inferKind(base, "platform"),
    domain,
    tags: tags.length > 0 ? tags : undefined,
  };
}

export function listTestFilesOnDisk(): string[] {
  return readdirSync(REGISTRY_DIR)
    .filter((f) => f.endsWith(".test.ts"))
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

export function listTestsByDomain(domain: PlatformDomainId, registry = loadTestRegistry()): string[] {
  return Object.entries(registry.tests)
    .filter(([, e]) => e.domain === domain || e.tags?.includes(domain))
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

export function assertAllTestsRegistered(registry = loadTestRegistry()): RegistryAssertResult {
  const onDisk = new Set(listTestFilesOnDisk());
  const inRegistry = new Set(Object.keys(registry.tests));

  const missingInRegistry = [...onDisk].filter((f) => !inRegistry.has(f)).sort();
  const extraInRegistry = [...inRegistry].filter((f) => !onDisk.has(f)).sort();

  const staleClassifications: string[] = [];
  for (const [file, entry] of Object.entries(registry.tests)) {
    if (!onDisk.has(file)) continue;
    const inferred = classifyTestFile(file);
    if (inferred.axis !== entry.axis) {
      staleClassifications.push(`${file}: axis ${entry.axis} != inferred ${inferred.axis}`);
    }
  }

  return {
    ok: missingInRegistry.length === 0 && extraInRegistry.length === 0,
    missingOnDisk: extraInRegistry,
    extraOnDisk: missingInRegistry,
    missingInRegistry,
    staleClassifications,
  };
}

export function buildDefaultCatalogModules(): Record<string, CatalogModuleEntry> {
  const modules: Record<string, CatalogModuleEntry> = {
    jp_permit_registry: { tier: "skeleton", coverage_tier: "full", cli: true, tests: ["jp-permit-registry.test.ts", "jp-permit-registry-application.test.ts"] },
    travel_booking: { tier: "production_ready", coverage_tier: "dedicated", cli: true, tests: ["travel-booking.test.ts"] },
    language_bridge: { tier: "production_ready", coverage_tier: "dedicated", cli: true, tests: ["language-bridge.test.ts"] },
    jp_subsidy_application: { tier: "production_ready", coverage_tier: "dedicated", cli: true, tests: ["jp-subsidy-application.test.ts"] },
    jp_trademark_application: { tier: "production_ready", coverage_tier: "dedicated", cli: true, tests: ["jp-trademark-application.test.ts"] },
    jp_corporate_registration: { tier: "production_ready", coverage_tier: "dedicated", cli: true, tests: ["jp-corporate-registration.test.ts"] },
    jp_medical_device: { tier: "production_ready", coverage_tier: "dedicated", cli: true, tests: ["jp-medical-device.test.ts"] },
    rental: { tier: "production_ready", coverage_tier: "partial", cli: false, tests: ["invoice.test.ts", "skeleton.test.ts"] },
    restaurant: { tier: "production_ready", coverage_tier: "partial", cli: false, tests: ["skeleton.test.ts"] },
    venture_capital: { tier: "production_ready", coverage_tier: "partial", cli: true, tests: ["venture-capital.test.ts", "wave-modules-cli.test.ts"] },
    hospitality: { tier: "production_ready", coverage_tier: "partial", cli: true, tests: [] },
    professional_services: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    saas_subscription: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    property_management: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    software_outsourcing: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    real_estate_brokerage: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    membership: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    staffing: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    ecommerce: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    event_operations: { tier: "production_ready", coverage_tier: "bundled", cli: true, tests: ["wave-modules-cli.test.ts"] },
    clinic: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
    construction: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
    education: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
    event_space: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
    logistics: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
    retail_store: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
    jp_carbon_neutral_2050: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
    jp_women_empowerment: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
    jp_privacy_policy: { tier: "production_ready", coverage_tier: "gap", cli: false, tests: [] },
  };
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
  const gapCount = Object.values(catalog_modules).filter((m) => m.coverage_tier === "gap").length;

  return {
    version: 2,
    stats: {
      vitest_total: files.length,
      catalog_total: 29,
      catalog_cli_registered: 18,
      catalog_gap: gapCount,
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
          "tenant-registry-coverage.test.ts",
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
        ],
      },
    },
    tests,
  };
}
