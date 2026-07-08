import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { ROOT_DIR } from "../src/lib/tenant.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { runStandaloneOrgDemo } from "../scripts/lib/standalone-org-demo.js";

describe("standalone org demo", () => {
  it("runStandaloneOrgDemo completes with approval.granted on chain", () => {
    const result = runStandaloneOrgDemo("hk-demo");
    expect(result.chainRecords).toBeGreaterThanOrEqual(3);
    expect(result.approvalEventId).toBeTruthy();
    expect(loadProtocolAuditChain().some((r) => r.event_id === result.approvalEventId)).toBe(true);
  });

  it("npm run demo:standalone-org exits 0", () => {
    execSync("npm run demo:standalone-org", {
      cwd: ROOT_DIR,
      env: { ...process.env, STANDALONE_DEMO_TENANT: "hk-demo" },
      stdio: "pipe",
    });
  });
});
