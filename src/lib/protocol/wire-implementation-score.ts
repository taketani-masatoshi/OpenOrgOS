import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { ROOT_DIR } from "../tenant.js";

export interface WireImplementationScoreItem {
  id: string;
  label: string;
  max_points: number;
  points: number;
  ok: boolean;
  detail?: string;
}

export interface WireImplementationScoreResult {
  mode: "checklist" | "strict-runtime";
  label: string;
  total: number;
  max: number;
  items: WireImplementationScoreItem[];
  grade: "pilot" | "production" | "enterprise";
  evidence?: WireScoreEvidenceSummary;
}

export interface WireScoreEvidenceSummary {
  runner: "vitest";
  command: string[];
  exit_code: number | null;
  executed_files: string[];
  passed_files: string[];
  failed_files: string[];
  passed_assertions: number;
  failed_assertions: number;
}

interface VitestAssertionResult {
  status?: string;
}

interface VitestFileResult {
  name?: string;
  status?: string;
  assertionResults?: VitestAssertionResult[];
}

export interface VitestJsonResult {
  testResults?: VitestFileResult[];
}

export interface StrictWireScoreInput {
  vitest: VitestJsonResult;
  command?: string[];
  exitCode?: number | null;
}

interface StrictScoreCategory {
  id: string;
  label: string;
  max: number;
  suites: string[];
}

export const STRICT_WIRE_SCORE_CATEGORIES: readonly StrictScoreCategory[] = [
  {
    id: "wg-core",
    label: "WG core routes and two-Gateway delivery",
    max: 12,
    suites: ["tests/wire-gateway-server.test.ts", "tests/wire-two-gateway-e2e.test.ts"],
  },
  {
    id: "security",
    label: "mTLS, replay, rate and boundary security",
    max: 10,
    suites: ["tests/wire-gateway-security-e2e.test.ts"],
  },
  {
    id: "trust-id",
    label: "Runtime pk-DID trust enforcement",
    max: 12,
    suites: [
      "tests/wire-gateway-security-e2e.test.ts",
      "tests/wire-node-pk-did-governance.test.ts",
    ],
  },
  {
    id: "openorg-dns",
    label: "DNS-only discovery and delivery",
    max: 10,
    suites: ["tests/openorg-dns.test.ts", "tests/wire-two-gateway-e2e.test.ts"],
  },
  {
    id: "federation-gossip",
    label: "Authenticated, persistent federation gossip",
    max: 10,
    suites: ["tests/wire-federation-gossip.test.ts", "tests/wire-two-gateway-e2e.test.ts"],
  },
  {
    id: "multipath",
    label: "Multipath transport delivery",
    max: 12,
    suites: ["tests/protocol-multipath.test.ts"],
  },
  {
    id: "store-forward",
    label: "Store-and-forward retry lifecycle",
    max: 10,
    suites: ["tests/wire-pending-retry.test.ts", "tests/wire-pending-flush-e2e.test.ts"],
  },
  {
    id: "r5-email",
    label: "R5 email-wire production roundtrip",
    max: 12,
    suites: ["tests/prod-wire-gate.test.ts", "tests/protocol-email-wire-roundtrip.test.ts"],
  },
  {
    id: "org-cert",
    label: "Signed organization certificate witness",
    max: 10,
    suites: ["tests/org-cert-witness.test.ts"],
  },
] as const;

export const STRICT_WIRE_SCORE_TEST_FILES = [
  ...new Set(STRICT_WIRE_SCORE_CATEGORIES.flatMap((category) => category.suites)),
] as const;

function readSource(relPath: string): string {
  const path = join(ROOT_DIR, relPath);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

function hasPattern(relPath: string, pattern: RegExp): boolean {
  return pattern.test(readSource(relPath));
}

function hasTestPattern(testPath: string, pattern: RegExp): boolean {
  return pattern.test(readSource(testPath));
}

function scoreItem(
  id: string,
  label: string,
  max: number,
  checks: Array<{ ok: boolean; weight: number; detail?: string }>
): WireImplementationScoreItem {
  const earned = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const failed = checks
    .filter((c) => !c.ok)
    .map((c) => c.detail)
    .filter(Boolean);
  return {
    id,
    label,
    max_points: max,
    points: Math.min(max, Math.round(earned)),
    ok: earned >= max * 0.8,
    detail: failed.length ? failed.join("; ") : undefined,
  };
}

/**
 * Static implementation checklist. This is useful for locating implementation gaps, but it is
 * not runtime evidence and must not be presented as the strict Wire score.
 */
export function evaluateWireImplementationChecklist(): WireImplementationScoreResult {
  const items: WireImplementationScoreItem[] = [
    scoreItem("wg-core", "WG core routes + gossip persist E2E", 12, [
      {
        ok: hasPattern("src/lib/wire-gateway/server.ts", /\/wire\/v1\/events/),
        weight: 3,
        detail: "wire events route missing",
      },
      {
        ok: hasPattern("src/lib/wire-gateway/server.ts", /applyIncomingWireFederationGossip/),
        weight: 3,
        detail: "gossip POST does not persist",
      },
      {
        ok: hasTestPattern(
          "tests/wire-gateway-server.test.ts",
          /federation\/catalog|wire\/v1\/health/
        ),
        weight: 3,
        detail: "gateway E2E tests missing",
      },
      {
        ok: existsSync(join(ROOT_DIR, "src/lib/wire-gateway/internal-api-server.ts")),
        weight: 3,
        detail: "internal API server missing",
      },
    ]),

    scoreItem("security", "Nonce/replay/rate/TLS paths tested", 10, [
      {
        ok: hasPattern("src/lib/wire-gateway/server.ts", /NonceLedger|nonce/),
        weight: 3,
        detail: "nonce ledger not wired",
      },
      {
        ok: hasPattern("src/lib/wire-gateway/server.ts", /RateLimiter|rate/),
        weight: 3,
        detail: "rate limiter not wired",
      },
      {
        ok: hasTestPattern("tests/wire-gateway-server.test.ts", /replay|403/),
        weight: 4,
        detail: "replay rejection E2E missing",
      },
    ]),

    scoreItem("trust-id", "pk-DID validate gates + slug reject", 12, [
      {
        ok: hasPattern("src/lib/protocol/validate.ts", /peer-slug-did-disallowed/),
        weight: 4,
        detail: "peer slug-DID gate missing in validate",
      },
      {
        ok: hasPattern("src/lib/protocol/wire-trust-registry.ts", /slug-did-disallowed/),
        weight: 4,
        detail: "trust registry slug-DID gate missing",
      },
      {
        ok: hasPattern("schemas/protocol/openorg-did.ts", /isPkPrefixedOpenOrgDid|isPkDidRequired/),
        weight: 4,
        detail: "pk-DID schema helpers missing",
      },
    ]),

    scoreItem("openorg-dns", "OpenOrg DNS in transport/discover", 10, [
      {
        ok: hasPattern(
          "src/lib/protocol/transport.ts",
          /resolveOpenOrgWireUrl|resolvePeerInboundEndpointsWithDns/
        ),
        weight: 5,
        detail: "OpenOrg DNS not integrated in transport",
      },
      {
        ok: hasPattern(
          "src/lib/wire-gateway/discover.ts",
          /resolveOpenOrgWireUrl|applyWireGatewayDiscoverAsync/
        ),
        weight: 5,
        detail: "OpenOrg DNS not integrated in discover apply",
      },
    ]),

    scoreItem("federation-gossip", "Gossip persist + gateway E2E", 10, [
      {
        ok: existsSync(join(ROOT_DIR, "src/lib/wire-gateway/federation-gossip-store.ts")),
        weight: 3,
        detail: "gossip store module missing",
      },
      {
        ok: hasPattern(
          "src/lib/wire-gateway/federation-gossip-store.ts",
          /applyIncomingWireFederationGossip/
        ),
        weight: 3,
        detail: "gossip merge persist missing",
      },
      {
        ok: hasTestPattern(
          "tests/wire-federation-gossip.test.ts",
          /mergeWireFederationGossipCatalogs|applyIncoming/
        ),
        weight: 4,
        detail: "gossip E2E test missing",
      },
    ]),

    scoreItem("multipath", "Multipath deliver tests pass", 12, [
      {
        ok: hasPattern("src/lib/protocol/transport.ts", /email_wire|wire_v1|relay/),
        weight: 4,
        detail: "multipath channels missing in transport",
      },
      {
        ok: existsSync(join(ROOT_DIR, "tests/protocol-multipath.test.ts")),
        weight: 4,
        detail: "multipath test file missing",
      },
      {
        ok: hasTestPattern("tests/protocol-multipath.test.ts", /email_wire|wire_v1/),
        weight: 4,
        detail: "multipath E2E assertions missing",
      },
    ]),

    scoreItem("store-forward", "Flush backoff + dead-letter audit", 10, [
      {
        ok: hasPattern("src/lib/protocol/transport.ts", /isWirePendingReadyForRetry/),
        weight: 3,
        detail: "flush does not respect next_retry_at",
      },
      {
        ok: hasPattern("src/lib/protocol/transport.ts", /appendWireDeadLetterAudit/),
        weight: 3,
        detail: "dead-letter audit missing",
      },
      {
        ok: hasTestPattern("tests/wire-pending-retry.test.ts", /next_retry_at/),
        weight: 4,
        detail: "backoff unit test missing",
      },
    ]),

    scoreItem("r5-email", "Phase2 protocol CLI + prod gate", 12, [
      {
        ok: hasPattern(
          "src/commands/protocol.ts",
          /runProtocolMailWireScan|scanMailReceivedForWire/
        ),
        weight: 4,
        detail: "protocol mail wire-scan missing",
      },
      {
        ok: hasPattern(
          "src/cli/registrars/orchestration.ts",
          /protocol.*mail.*wire-scan|wire-scan/
        ),
        weight: 4,
        detail: "CLI protocol mail wire-scan not registered",
      },
      {
        ok: hasPattern(
          "src/lib/protocol/prod-wire-gate.ts",
          /email_wire|evaluateEmailWireReadiness/
        ),
        weight: 4,
        detail: "prod-wire-gate email_wire check missing",
      },
    ]),

    scoreItem("org-cert", "SPKI hash witness/PKIX integration", 10, [
      {
        ok: hasPattern("src/lib/protocol/org-cert-witness.ts", /loadWitnessTrustBundle|witness/),
        weight: 5,
        detail: "org cert not connected to witness-trust",
      },
      {
        ok: hasPattern(
          "src/lib/wire-gateway/did.ts",
          /resolveOrganizationCertificateSpkiSha256|org-cert-witness/
        ),
        weight: 5,
        detail: "well-known org cert not using witness anchor",
      },
    ]),

    scoreItem("test-depth", "Static test-artifact checklist (not execution evidence)", 12, [
      {
        ok: readSource("src/lib/protocol/wire-implementation-score.ts").includes("scoreItem("),
        weight: 4,
        detail: "score lacks weighted category checks",
      },
      {
        ok: hasPattern(
          "src/lib/protocol/wire-implementation-score.ts",
          /hasPattern|hasTestPattern/
        ),
        weight: 4,
        detail: "score lacks source pattern verification",
      },
      {
        ok: existsSync(join(ROOT_DIR, "tests/wire-implementation-score.test.ts")),
        weight: 4,
        detail: "score self-test missing",
      },
    ]),
  ];

  const rawTotal = items.reduce((s, i) => s + i.points, 0);
  const rawMax = items.reduce((s, i) => s + i.max_points, 0);
  const max = 100;
  const total = Math.min(max, Math.round((rawTotal / rawMax) * max));
  const grade = total >= 95 ? "enterprise" : total >= 80 ? "production" : "pilot";

  return {
    mode: "checklist",
    label: "Static implementation checklist (not a runtime score)",
    total,
    max,
    items,
    grade,
  };
}

/** Backward-compatible alias. Callers should prefer evaluateWireImplementationChecklist(). */
export function evaluateWireImplementationScore(): WireImplementationScoreResult {
  return evaluateWireImplementationChecklist();
}

function normalizeVitestFileName(fileName: string): string {
  const absolute = resolve(fileName);
  return relative(ROOT_DIR, absolute).split("\\").join("/");
}

function isPassedFile(result: VitestFileResult): boolean {
  const assertions = result.assertionResults ?? [];
  return (
    result.status === "passed" &&
    assertions.length > 0 &&
    assertions.every((assertion) => assertion.status === "passed")
  );
}

/**
 * Score only supplied Vitest execution results. Source text and file existence are deliberately
 * not consulted here, so an unexecuted suite cannot earn strict points.
 */
export function evaluateStrictWireImplementationScore(
  input: StrictWireScoreInput
): WireImplementationScoreResult {
  const results = (input.vitest.testResults ?? []).filter(
    (result): result is VitestFileResult & { name: string } => typeof result.name === "string"
  );
  const byFile = new Map(results.map((result) => [normalizeVitestFileName(result.name), result]));

  const categoryItems = STRICT_WIRE_SCORE_CATEGORIES.map((category) => {
    const passed = category.suites.filter((suite) => {
      const result = byFile.get(suite);
      return result ? isPassedFile(result) : false;
    });
    const points = Math.round((passed.length / category.suites.length) * category.max);
    const missing = category.suites.filter((suite) => !byFile.has(suite));
    const failed = category.suites.filter((suite) => {
      const result = byFile.get(suite);
      return result != null && !isPassedFile(result);
    });
    const gaps = [
      ...missing.map((suite) => `${suite} not executed`),
      ...failed.map((suite) => `${suite} failed or had no passing assertions`),
    ];
    return {
      id: category.id,
      label: category.label,
      max_points: category.max,
      points,
      ok: passed.length === category.suites.length,
      detail: gaps.length ? gaps.join("; ") : undefined,
    };
  });

  const passedAssertions = results.reduce(
    (sum, result) =>
      sum +
      (result.assertionResults ?? []).filter((assertion) => assertion.status === "passed").length,
    0
  );
  const failedAssertions = results.reduce(
    (sum, result) =>
      sum +
      (result.assertionResults ?? []).filter((assertion) => assertion.status !== "passed").length,
    0
  );
  const passedRuntimeCategories = categoryItems.filter((item) => item.ok).length;
  const testDepthPoints = Math.round(
    12 *
      Math.min(
        1,
        Math.min(
          passedRuntimeCategories / STRICT_WIRE_SCORE_CATEGORIES.length,
          passedAssertions / 20
        )
      )
  );
  const testDepth: WireImplementationScoreItem = {
    id: "test-depth",
    label: "Executed runtime evidence depth",
    max_points: 12,
    points: testDepthPoints,
    ok:
      passedRuntimeCategories === STRICT_WIRE_SCORE_CATEGORIES.length &&
      passedAssertions >= 20 &&
      failedAssertions === 0,
    detail:
      passedRuntimeCategories === STRICT_WIRE_SCORE_CATEGORIES.length &&
      passedAssertions >= 20 &&
      failedAssertions === 0
        ? undefined
        : `${passedRuntimeCategories}/${STRICT_WIRE_SCORE_CATEGORIES.length} runtime categories passed; ${passedAssertions} assertions passed; ${failedAssertions} failed`,
  };
  const items = [...categoryItems, testDepth];
  const rawTotal = items.reduce((sum, item) => sum + item.points, 0);
  const rawMax = items.reduce((sum, item) => sum + item.max_points, 0);
  const total = Math.min(100, Math.round((rawTotal / rawMax) * 100));
  const grade = total >= 95 ? "enterprise" : total >= 80 ? "production" : "pilot";
  const executedFiles = [...byFile.keys()].sort();
  const passedFiles = executedFiles.filter((file) => isPassedFile(byFile.get(file)!));

  return {
    mode: "strict-runtime",
    label: "Strict runtime score (Vitest execution evidence)",
    total,
    max: 100,
    items,
    grade,
    evidence: {
      runner: "vitest",
      command: input.command ?? [],
      exit_code: input.exitCode ?? null,
      executed_files: executedFiles,
      passed_files: passedFiles,
      failed_files: executedFiles.filter((file) => !passedFiles.includes(file)),
      passed_assertions: passedAssertions,
      failed_assertions: failedAssertions,
    },
  };
}

export function runStrictWireImplementationScore(): WireImplementationScoreResult {
  const vitestBin = join(ROOT_DIR, "node_modules", "vitest", "vitest.mjs");
  const command = [
    process.execPath,
    vitestBin,
    "run",
    ...STRICT_WIRE_SCORE_TEST_FILES,
    "--reporter=json",
  ];
  const execution = spawnSync(command[0], command.slice(1), {
    cwd: ROOT_DIR,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });

  let vitest: VitestJsonResult = { testResults: [] };
  try {
    vitest = JSON.parse(execution.stdout || "{}") as VitestJsonResult;
  } catch {
    // Invalid or absent runner output is honest zero evidence, never a static fallback.
  }

  return evaluateStrictWireImplementationScore({
    vitest,
    command,
    exitCode: execution.status,
  });
}
