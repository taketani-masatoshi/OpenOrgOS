import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
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
] as const;

/** Committed tenant paths restored before each test (deduped — mal protocol included via OPERATIONAL). */
const FIXTURE_PATHS = [
  "tenants/demo/data",
  "tenants/mal/data/org",
  ...OPERATIONAL_PROTOCOL_TENANTS.map((id) => `tenants/${id}/data/protocol`),
] as const;

/** Overlay after demo/data restore — agents.yaml is not in git archive yet. */
const TENANT_ROSTER_FIXTURE_ROOT = join(ROOT_DIR, "tests", "fixtures", "tenant-rosters");

const SNAPSHOT_ROOT = join(ROOT_DIR, "tests", ".fixture-snapshot", String(process.pid));
const RESTORE_LOCK_DIR = join(ROOT_DIR, "tests", ".fixture-restore.lock");
let restoreLockHeld = false;

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function acquireFixtureRestoreLock(): void {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      mkdirSync(RESTORE_LOCK_DIR);
      writeFileSync(join(RESTORE_LOCK_DIR, "owner"), String(process.pid), "utf-8");
      restoreLockHeld = true;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const owner = Number(readFileSync(join(RESTORE_LOCK_DIR, "owner"), "utf-8"));
        // Vitest may reuse a worker process while reloading this setup module.
        // A lock marker owned by this PID is stale; no concurrent test in the
        // same worker can be restoring fixtures when fileParallelism is false.
        if (owner === process.pid) {
          rmSync(RESTORE_LOCK_DIR, { recursive: true, force: true });
          restoreLockHeld = false;
          continue;
        }
        if (Number.isInteger(owner) && owner > 0 && !processExists(owner)) {
          rmSync(RESTORE_LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      } catch {
        // The owner may still be creating the marker; retry without deleting it.
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  throw new Error("Timed out waiting for fixture restore lock");
}

function releaseFixtureRestoreLock(): void {
  if (!restoreLockHeld) return;
  rmSync(RESTORE_LOCK_DIR, { recursive: true, force: true });
  restoreLockHeld = false;
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

function overlayTenantRosterFixtures(): void {
  if (!existsSync(TENANT_ROSTER_FIXTURE_ROOT)) return;
  for (const tenantId of readdirSync(TENANT_ROSTER_FIXTURE_ROOT, { withFileTypes: true })) {
    if (!tenantId.isDirectory() || tenantId.name.startsWith(".")) continue;
    const src = join(TENANT_ROSTER_FIXTURE_ROOT, tenantId.name, "agents.yaml");
    if (!existsSync(src)) continue;
    const dest = join(ROOT_DIR, "tenants", tenantId.name, "data", "operator", "agents.yaml");
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { force: true });
  }
}

function restoreCommittedTenantFixtures(): void {
  for (const rel of FIXTURE_PATHS) {
    const src = join(SNAPSHOT_ROOT, rel);
    const dest = join(ROOT_DIR, rel);
    if (!existsSync(src)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    const preserved = preservedProtocolPaths(rel)
      .filter((path) => existsSync(path))
      .map((path) => ({
        path,
        backup: join(SNAPSHOT_ROOT, ".runtime-preserve", relative(ROOT_DIR, path)),
      }));
    for (const item of preserved) {
      rmSync(item.backup, { recursive: true, force: true });
      mkdirSync(dirname(item.backup), { recursive: true });
      cpSync(item.path, item.backup, { recursive: true, force: true });
    }
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
    cpSync(src, dest, { recursive: true, force: true });
    for (const item of preserved) {
      mkdirSync(dirname(item.path), { recursive: true });
      cpSync(item.backup, item.path, { recursive: true, force: true });
      rmSync(item.backup, { recursive: true, force: true });
    }
  }
  overlayTenantRosterFixtures();
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

function resetTenantCaches(): void {
  clearOperatorsRegistryCacheForTests();
  clearWireGovernanceCacheForTests();
}

beforeAll(() => {
  buildFixtureSnapshot();
  cleanGeneratedAgentMissions();
});

beforeEach(() => {
  acquireFixtureRestoreLock();
  try {
    restoreCommittedTenantFixtures();
    resetTenantCaches();
  } catch (error) {
    releaseFixtureRestoreLock();
    throw error;
  }
});

afterEach(() => {
  releaseFixtureRestoreLock();
});

afterAll(() => {
  releaseFixtureRestoreLock();
  cleanGeneratedAgentMissions();
  rmSync(SNAPSHOT_ROOT, { recursive: true, force: true });
});
