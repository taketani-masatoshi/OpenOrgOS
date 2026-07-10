import { afterEach, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR, setTenantId } from "../src/lib/tenant.js";

/** Operational tenants whose committed protocol config must survive E2E demos. */
const OPERATIONAL_PROTOCOL_TENANTS = ["mal", "southwood", "aiac"] as const;

const GIT_RESTORE_PATHS = [
  "tenants/demo/data",
  ...OPERATIONAL_PROTOCOL_TENANTS.flatMap((id) => [
    `tenants/${id}/data/protocol`,
    `tenants/${id}/docs/protocol`,
  ]),
] as const;

/** Tenants whose generated agent-mission YAML must not accumulate across tests. */
const MISSION_CLEANUP_TENANTS = ["demo", "mal", ...OPERATIONAL_PROTOCOL_TENANTS] as const;

function restoreCommittedTenantFixtures(): void {
  setTenantId(process.env.ORGOS_TENANT ?? "mal");
  try {
    execSync(`git restore -- ${GIT_RESTORE_PATHS.join(" ")}`, {
      cwd: ROOT_DIR,
      stdio: "ignore",
    });
  } catch {
    /* paths may be untracked only */
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

beforeEach(() => {
  restoreCommittedTenantFixtures();
  cleanGeneratedAgentMissions();
});

afterEach(() => {
  cleanGeneratedAgentMissions();
});
