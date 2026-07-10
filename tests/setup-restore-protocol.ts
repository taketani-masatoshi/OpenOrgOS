import { afterAll, beforeAll, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { clearWireGovernanceCacheForTests } from "../src/lib/jurisdiction/wire-governance/index.js";
import { ROOT_DIR } from "../src/lib/tenant.js";

/** Operational tenants whose committed protocol config must survive E2E demos. */
const OPERATIONAL_PROTOCOL_TENANTS = ["mal", "southwood", "aiac"] as const;

const FIXTURE_PATHS = [
  "tenants/demo/data",
  "tenants/mal/data/protocol",
  ...OPERATIONAL_PROTOCOL_TENANTS.map((id) => `tenants/${id}/data/protocol`),
] as const;

const SNAPSHOT_ROOT = join(ROOT_DIR, "tests", ".fixture-snapshot");

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
}

function restoreCommittedTenantFixtures(): void {
  for (const rel of FIXTURE_PATHS) {
    const src = join(SNAPSHOT_ROOT, rel);
    const dest = join(ROOT_DIR, rel);
    if (!existsSync(src)) continue;
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
    cpSync(src, dest, { recursive: true, force: true });
  }
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
  restoreCommittedTenantFixtures();
  resetTenantCaches();
});

afterAll(() => {
  cleanGeneratedAgentMissions();
});
