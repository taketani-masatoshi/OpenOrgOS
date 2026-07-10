import { afterEach, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { clearWireGovernanceCacheForTests } from "../src/lib/jurisdiction/wire-governance/index.js";
import { ROOT_DIR } from "../src/lib/tenant.js";

/** Operational tenants whose committed protocol config must survive E2E demos. */
const OPERATIONAL_PROTOCOL_TENANTS = ["mal", "southwood", "aiac"] as const;

/**
 * Git-tracked paths restored before each test (individually — one bad path must not block others).
 * Demo protocol is intentionally omitted; tests that mutate it manage their own cleanup.
 */
const GIT_RESTORE_PATHS = [
  "tenants/demo/data/org/operators.yaml",
  "tenants/demo/data/org/pending-approvals.yaml",
  "tenants/demo/data/company-events.yaml",
  "tenants/demo/data/finance",
  "tenants/demo/data/executive",
  "tenants/mal/data/finance/cash-balance.yaml",
  ...OPERATIONAL_PROTOCOL_TENANTS.map((id) => `tenants/${id}/data/protocol`),
] as const;

/** Tenants whose generated agent-mission YAML must not accumulate across tests. */
const MISSION_CLEANUP_TENANTS = ["demo", "mal", ...OPERATIONAL_PROTOCOL_TENANTS] as const;

function restoreCommittedTenantFixtures(): void {
  for (const rel of GIT_RESTORE_PATHS) {
    try {
      execSync(`git restore -- "${rel}"`, { cwd: ROOT_DIR, stdio: "ignore" });
    } catch {
      /* path may be untracked only or absent from index */
    }
  }
  const demoChain = join(ROOT_DIR, "tenants/demo/data/company-events-chain.jsonl");
  if (existsSync(demoChain)) {
    unlinkSync(demoChain);
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

beforeEach(() => {
  cleanGeneratedAgentMissions();
  restoreCommittedTenantFixtures();
  resetTenantCaches();
});

afterEach(() => {
  resetTenantCaches();
});
