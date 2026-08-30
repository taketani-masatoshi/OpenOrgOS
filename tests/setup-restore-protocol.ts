import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { threadId } from "node:worker_threads";
import {
  isLockAbandoned,
  parseLockOwnerText,
  shouldPruneSnapshotDir,
  type FixtureLockOwner,
} from "./helpers/fixture-restore-lock.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { resetStripeSecretsHydrationForTest } from "../src/lib/product/stripe-secrets-store.js";
import { clearWireGovernanceCacheForTests } from "../src/lib/jurisdiction/wire-governance/index.js";
import { ROOT_DIR } from "../src/lib/tenant.js";

/** Operational tenants whose committed protocol config must survive E2E demos. */
const OPERATIONAL_PROTOCOL_TENANTS = ["mal", "southwood", "aiac"] as const;

/** Runtime protocol subdirs preserved across fixture restore (production pilot state). */
const PRESERVE_PROTOCOL_SUBDIRS = [
  "witness-trust",
  "signing-key.pem",
  "federation-gossip-store.yaml",
  "peers.yaml",
  "transactions-registry.yaml",
] as const;

/** L2 / runtime tenant files preserved across fixture restore (gitignored pilot state). */
const PRESERVE_TENANT_RUNTIME_PATHS: Partial<
  Record<(typeof OPERATIONAL_PROTOCOL_TENANTS)[number], readonly string[]>
> = {
  mal: ["records/executive/mail-config.yaml"],
};

/** Committed tenant paths restored before each test (deduped — mal protocol included via OPERATIONAL). */
const FIXTURE_PATHS = [
  "tenants/demo/data",
  "tenants/mal/data/org",
  ...OPERATIONAL_PROTOCOL_TENANTS.map((id) => `tenants/${id}/data/protocol`),
  // Ledger suites post journals into the books fixture; keep the committed
  // ledger empty so each test starts from the same opening state.
  "tenants/_fixture-books/data/finance",
  // Company events span a Markdown body under docs/ and a registry plus hash
  // chain under data/. Restoring only one half leaves a second run refusing to
  // create the event it already has.
  "tenants/demo/docs/company/events",
  "tenants/_fixture-books/docs/company/events",
  "tenants/_fixture-books/data/company-events.yaml",
  "tenants/_fixture-books/data/company-events-chain.jsonl",
] as const;

/**
 * Environment variables that change how the product behaves (production mode,
 * Stripe stubs, LLM tools). A test that sets one and forgets to restore it
 * silently rewrites the rules for every test that runs after it in the worker.
 */
const VOLATILE_ENV_PREFIXES = ["ORGOS_", "STRIPE_", "WIRE_CONSOLE_"] as const;

let envSnapshot: Record<string, string | undefined> = {};

function captureEnv(): void {
  envSnapshot = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (VOLATILE_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      envSnapshot[key] = value;
    }
  }
}

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!VOLATILE_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    if (!(key in envSnapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Overlay after demo/data restore — demo/data wipe does not include operator/agents.yaml. */
const TENANT_ROSTER_FIXTURE_ROOT = join(ROOT_DIR, "tests", "fixtures", "tenant-rosters");

const SNAPSHOT_PARENT = join(ROOT_DIR, "tests", ".fixture-snapshot");
/** Worker-unique: forks share no pid, but threads pool workers do. */
const WORKER_TOKEN = `${process.pid}-${threadId}`;
const SNAPSHOT_ROOT = join(SNAPSHOT_PARENT, WORKER_TOKEN);
const RESTORE_LOCK_DIR = join(ROOT_DIR, "tests", ".fixture-restore.lock");
const OWNER_MARKER = join(RESTORE_LOCK_DIR, "owner");

/**
 * A concurrent `vitest` run on the same worktree (another terminal / agent session)
 * legitimately holds this lock for minutes. Raise via ORGOS_TEST_LOCK_TIMEOUT_MS.
 */
const LOCK_TIMEOUT_MS = Number(process.env.ORGOS_TEST_LOCK_TIMEOUT_MS ?? 90_000);
/** A lock dir whose marker never materialises is a crashed acquirer. */
const MARKER_GRACE_MS = 5_000;
const OWNER_STALE_MS = 120_000;

let restoreLockHeld = false;

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function readLockOwner(): FixtureLockOwner | null {
  let text: string;
  try {
    text = readFileSync(OWNER_MARKER, "utf-8");
  } catch {
    return null;
  }
  return parseLockOwnerText(text);
}

/**
 * Publish ownership atomically so waiters never observe a half-written marker.
 * Returns false when a concurrent waiter broke the lock dir mid-publish.
 */
function writeLockOwner(): boolean {
  const owner: FixtureLockOwner = { token: WORKER_TOKEN, pid: process.pid, startedAt: Date.now() };
  const tmp = `${OWNER_MARKER}.${WORKER_TOKEN}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(owner), "utf-8");
    renameSync(tmp, OWNER_MARKER);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    rmSync(tmp, { force: true });
    return false;
  }
}

function breakLock(): void {
  rmSync(RESTORE_LOCK_DIR, { recursive: true, force: true });
}

function backoff(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
}

function acquireFixtureRestoreLock(): void {
  const startedWaiting = Date.now();
  const deadline = startedWaiting + LOCK_TIMEOUT_MS;
  let markerMissingSince = 0;
  let lastOwner: FixtureLockOwner | null = null;

  while (Date.now() < deadline) {
    try {
      mkdirSync(RESTORE_LOCK_DIR);
      if (writeLockOwner()) {
        restoreLockHeld = true;
        return;
      }
      backoff();
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    const owner = readLockOwner();
    if (!owner) {
      // Acquirer may still be publishing its marker; only break once it clearly gave up.
      if (markerMissingSince === 0) markerMissingSince = Date.now();
      else if (Date.now() - markerMissingSince > MARKER_GRACE_MS) breakLock();
    } else {
      markerMissingSince = 0;
      lastOwner = owner;
      const abandoned = isLockAbandoned(owner, {
        workerToken: WORKER_TOKEN,
        staleMs: OWNER_STALE_MS,
        processExists,
      });
      if (abandoned) {
        restoreLockHeld = false;
        breakLock();
        continue;
      }
    }
    backoff();
  }

  throw new Error(
    [
      `Timed out waiting for fixture restore lock after ${Date.now() - startedWaiting}ms.`,
      lastOwner
        ? `Held by pid ${lastOwner.pid} (token ${lastOwner.token}) for ${Date.now() - lastOwner.startedAt}ms.`
        : `Lock dir ${RESTORE_LOCK_DIR} has no readable owner marker.`,
      "Another vitest run is likely active on this worktree — finish it, or raise ORGOS_TEST_LOCK_TIMEOUT_MS.",
    ].join(" ")
  );
}

function releaseFixtureRestoreLock(): void {
  if (!restoreLockHeld) return;
  breakLock();
  restoreLockHeld = false;
}

/**
 * Worker snapshots leak whenever a run is killed before afterAll; reap dead owners.
 * Returns pids of snapshots still owned by live foreign processes (concurrent vitest runs).
 */
function pruneOrphanSnapshots(): number[] {
  if (!existsSync(SNAPSHOT_PARENT)) return [];
  const live = new Set<number>();
  for (const entry of readdirSync(SNAPSHOT_PARENT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const action = shouldPruneSnapshotDir(entry.name, {
      workerToken: WORKER_TOKEN,
      selfPid: process.pid,
      processExists,
    });
    if (action === "keep-live") {
      const pid = Number(entry.name.split("-")[0]);
      if (Number.isInteger(pid) && pid > 0) live.add(pid);
      continue;
    }
    if (action === "keep-self") continue;
    rmSync(join(SNAPSHOT_PARENT, entry.name), { recursive: true, force: true });
  }
  return [...live];
}

/**
 * Fixture restore is serialized, but test bodies are not: two vitest runs on one
 * worktree still race on shared tenant files. Surface it instead of leaving
 * unexplained cross-run failures.
 */
function warnOnConcurrentRuns(foreignPids: number[]): void {
  if (foreignPids.length === 0) return;
  console.warn(
    `⚠ ${foreignPids.length} other vitest run(s) active on this worktree (pid ${foreignPids.join(", ")}). ` +
      "Shared tenant fixtures may race — run suites sequentially for reliable results."
  );
}

/** Tenants whose generated agent-mission YAML must not accumulate across tests. */
const MISSION_CLEANUP_TENANTS = ["demo", "mal", ...OPERATIONAL_PROTOCOL_TENANTS] as const;

function buildFixtureSnapshot(): void {
  if (existsSync(SNAPSHOT_ROOT)) {
    rmSync(SNAPSHOT_ROOT, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
  mkdirSync(SNAPSHOT_ROOT, { recursive: true });
  execSync(`git archive HEAD ${FIXTURE_PATHS.join(" ")} | tar -x -C "${SNAPSHOT_ROOT}"`, {
    cwd: ROOT_DIR,
    stdio: "ignore",
  });
  for (const rel of FIXTURE_PATHS) {
    const src = join(SNAPSHOT_ROOT, rel);
    if (!existsSync(src)) {
      throw new Error(
        `Fixture snapshot missing ${rel} — commit the path or remove it from FIXTURE_PATHS in tests/setup-restore-protocol.ts`
      );
    }
  }
}

function preservedProtocolPaths(rel: string): string[] {
  const match = rel.match(/^tenants\/([^/]+)\/data\/protocol$/);
  if (!match || !OPERATIONAL_PROTOCOL_TENANTS.includes(match[1] as (typeof OPERATIONAL_PROTOCOL_TENANTS)[number])) {
    return [];
  }
  return PRESERVE_PROTOCOL_SUBDIRS.map((name) => join(ROOT_DIR, rel, name));
}

function preservedTenantRuntimePaths(): string[] {
  const paths: string[] = [];
  for (const tenantId of OPERATIONAL_PROTOCOL_TENANTS) {
    for (const rel of PRESERVE_TENANT_RUNTIME_PATHS[tenantId] ?? []) {
      paths.push(join(ROOT_DIR, "tenants", tenantId, rel));
    }
  }
  return paths;
}

function backupPreservedPaths(
  snapshotRoot: string,
  paths: string[]
): Array<{ path: string; backup: string }> {
  return paths
    .filter((path) => existsSync(path))
    .map((path) => ({
      path,
      backup: join(snapshotRoot, ".runtime-preserve", relative(ROOT_DIR, path)),
    }));
}

function restorePreservedPaths(items: Array<{ path: string; backup: string }>): void {
  for (const item of items) {
    mkdirSync(dirname(item.path), { recursive: true });
    cpSync(item.backup, item.path, { recursive: true, force: true });
    rmSync(item.backup, { recursive: true, force: true });
  }
}

/** Overlay after org restore — keeps uncommitted org-chart.yaml available in tests. */
const ORG_CHART_FIXTURE_ROOT = join(ROOT_DIR, "tests", "fixtures", "org-charts");

/** Uncommitted `data/org` files (pilot state) the restore would otherwise delete. */
const ORG_OVERLAY_FILES = [
  "org-chart.yaml",
  "org-authority.yaml",
  "budget-delegations.yaml",
  "budget-delegations-fy2026.yaml",
  "operators.yaml",
] as const;

function overlayOrgChartFixtures(): void {
  if (!existsSync(ORG_CHART_FIXTURE_ROOT)) return;
  for (const tenantId of readdirSync(ORG_CHART_FIXTURE_ROOT, { withFileTypes: true })) {
    if (!tenantId.isDirectory() || tenantId.name.startsWith(".")) continue;
    const srcDir = join(ORG_CHART_FIXTURE_ROOT, tenantId.name);
    const destDir = join(ROOT_DIR, "tenants", tenantId.name, "data", "org");
    mkdirSync(destDir, { recursive: true });
    for (const name of ORG_OVERLAY_FILES) {
      const src = join(srcDir, name);
      if (existsSync(src)) {
        cpSync(src, join(destDir, name), { force: true });
      }
    }
    const histSrc = join(srcDir, "org-chart-history");
    if (existsSync(histSrc)) {
      cpSync(histSrc, join(destDir, "org-chart-history"), { recursive: true, force: true });
    }
  }
}

function overlayTenantRosterFixtures(): void {
  if (!existsSync(TENANT_ROSTER_FIXTURE_ROOT)) return;
  for (const tenantId of readdirSync(TENANT_ROSTER_FIXTURE_ROOT, { withFileTypes: true })) {
    if (!tenantId.isDirectory() || tenantId.name.startsWith(".")) continue;
    const src = join(TENANT_ROSTER_FIXTURE_ROOT, tenantId.name, "agents.yaml");
    if (!existsSync(src)) continue;
    const dest = join(ROOT_DIR, "tenants", tenantId.name, "data", "operator", "agents.yaml");
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest)) rmSync(dest, { force: true });
    cpSync(src, dest);
  }
}

function restoreCommittedTenantFixtures(): void {
  const runtimePreserved = backupPreservedPaths(SNAPSHOT_ROOT, preservedTenantRuntimePaths());
  for (const item of runtimePreserved) {
    rmSync(item.backup, { recursive: true, force: true });
    mkdirSync(dirname(item.backup), { recursive: true });
    cpSync(item.path, item.backup, { recursive: true, force: true });
  }

  for (const rel of FIXTURE_PATHS) {
    const src = join(SNAPSHOT_ROOT, rel);
    const dest = join(ROOT_DIR, rel);
    if (!existsSync(src)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    const preserved = backupPreservedPaths(SNAPSHOT_ROOT, preservedProtocolPaths(rel));
    for (const item of preserved) {
      rmSync(item.backup, { recursive: true, force: true });
      mkdirSync(dirname(item.backup), { recursive: true });
      cpSync(item.path, item.backup, { recursive: true, force: true });
    }
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
    cpSync(src, dest, { recursive: true, force: true });
    restorePreservedPaths(preserved);
  }
  restorePreservedPaths(runtimePreserved);
  overlayTenantRosterFixtures();
  overlayOrgChartFixtures();
}

function cleanGeneratedAgentMissions(): void {
  for (const tenantId of MISSION_CLEANUP_TENANTS) {
    const dir = join(ROOT_DIR, "tenants", tenantId, "docs/reports/agent-missions/missions");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".yaml")) {
        unlinkSync(join(dir, file));
      }
    }
  }
}

function resetMalExecutiveMailTriageQueue(): void {
  const queuePath = join(ROOT_DIR, "tenants/mal/data/executive/mail-triage-queue.yaml");
  mkdirSync(dirname(queuePath), { recursive: true });
  writeFileSync(queuePath, "version: 1\nentries: []\n", "utf-8");
}

function resetTenantCaches(): void {
  clearOperatorsRegistryCacheForTests();
  clearWireGovernanceCacheForTests();
  resetStripeSecretsHydrationForTest();
}

/** The per-run Stripe store is scratch state; no test may inherit another's keys. */
function resetStripeSecretsStore(): void {
  const path = process.env.ORGOS_STRIPE_SECRETS_FILE;
  if (path) rmSync(path, { force: true });
}

beforeAll(() => {
  warnOnConcurrentRuns(pruneOrphanSnapshots());
  buildFixtureSnapshot();
  cleanGeneratedAgentMissions();
});

beforeEach(() => {
  captureEnv();
  acquireFixtureRestoreLock();
  try {
    restoreCommittedTenantFixtures();
    resetMalExecutiveMailTriageQueue();
    resetStripeSecretsStore();
    resetTenantCaches();
  } catch (error) {
    releaseFixtureRestoreLock();
    throw error;
  }
});

afterEach(() => {
  restoreEnv();
  releaseFixtureRestoreLock();
});

afterAll(() => {
  releaseFixtureRestoreLock();
  cleanGeneratedAgentMissions();
  rmSync(SNAPSHOT_ROOT, { recursive: true, force: true });
});
