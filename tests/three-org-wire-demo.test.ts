import { execSync } from "node:child_process";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { runThreeOrgWireDemo } from "../scripts/lib/three-org-wire-demo.js";
import { ROOT_DIR } from "../src/lib/tenant.js";

const DEMO_TENANTS = ["mal", "southwood", "aiac"] as const;

function restoreDemoProtocolDirs(): void {
  for (const id of DEMO_TENANTS) {
    for (const rel of [`tenants/${id}/data/protocol`, `tenants/${id}/docs/protocol`]) {
      try {
        execSync(`git restore -- "${rel}"`, { cwd: ROOT_DIR, stdio: "ignore" });
      } catch {
        /* path may be untracked only */
      }
    }
  }
}

describe("three-org wire demo", () => {
  beforeEach(() => {
    restoreDemoProtocolDirs();
  });

  afterEach(() => {
    restoreDemoProtocolDirs();
  });

  it(
    "mal ↔ southwood inter-org + mesh to aiac",
    async () => {
      const result = await runThreeOrgWireDemo();
      expect(result.interOrgEventId).toBeTruthy();
      expect(result.meshEventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(existsSync(result.meshInboxPath)).toBe(true);
      expect(result.postOrder).toEqual(["PEER-004", "PEER-003"]);
      const inbox = JSON.parse(readFileSync(result.meshInboxPath, "utf-8"));
      expect(inbox.event_id).toBe(result.meshEventId);
    },
    120_000
  );
});
