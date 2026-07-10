import { afterEach, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { ROOT_DIR, setTenantId } from "../src/lib/tenant.js";

/** Operational tenants whose committed protocol config must survive E2E demos. */
const OPERATIONAL_PROTOCOL_TENANTS = ["mal", "southwood", "aiac"] as const;

const GIT_RESTORE_PATHS = [
  "tenants/demo/data/protocol",
  ...OPERATIONAL_PROTOCOL_TENANTS.flatMap((id) => [
    `tenants/${id}/data/protocol`,
    `tenants/${id}/docs/protocol`,
  ]),
] as const;

function restoreCommittedTenantFixtures(): void {
  setTenantId(process.env.ORGOS_TENANT ?? "mal");
  for (const rel of GIT_RESTORE_PATHS) {
    try {
      execSync(`git restore -- "${rel}"`, { cwd: ROOT_DIR, stdio: "ignore" });
    } catch {
      /* path may be untracked only */
    }
  }
}

beforeEach(() => {
  restoreCommittedTenantFixtures();
});

afterEach(() => {
  restoreCommittedTenantFixtures();
});
