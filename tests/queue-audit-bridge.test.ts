import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT_DIR, setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { pushQueueEvent } from "../src/lib/queue-db.js";
import { listAuditEvents } from "../src/lib/audit-log.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { getOrgAuditBridgeConfigPath } from "../src/lib/org/paths.js";
import { clearOrgAuditBridgeStateForTests } from "../src/lib/org/audit-bridge-state.js";

/**
 * `data/org` and `data/protocol` hold committed fixtures (org chart, peers) next to
 * the generated state this test resets, so the directories cannot be removed
 * wholesale — doing so deleted tracked files out of the worktree. Tracked-or-not is
 * the rule rather than a list of names, which would rot as the product adds state.
 */
let trackedFiles: Set<string> | null = null;

function isTracked(path: string): boolean {
  if (trackedFiles === null) {
    const listed = execSync("git ls-files -z", { cwd: ROOT_DIR, encoding: "utf-8" });
    trackedFiles = new Set(listed.split("\0").filter(Boolean));
  }
  return trackedFiles.has(relative(ROOT_DIR, path));
}

function removeGeneratedFiles(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      removeGeneratedFiles(full);
      if (readdirSync(full).length === 0) rmSync(full, { recursive: true, force: true });
      continue;
    }
    if (!isTracked(full)) rmSync(full, { force: true });
  }
}

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org"),
    join(getDataDir(), "protocol"),
    join(getDocsDir(), "reports", "routing-queue"),
    join(getDocsDir(), "reports", "audit-log"),
  ]) {
    removeGeneratedFiles(p);
  }
}

describe("queue audit bridge mapping", () => {
  beforeEach(() => {
    delete process.env.ORGOS_AUDIT_BRIDGE_DISABLED;
    delete process.env.ORGOS_AUDIT_LOG;
    delete process.env.ORGOS_AUDIT_TENANT;
    setTenantId("demo");
    cleanup();
    clearOrgAuditBridgeStateForTests();
    ensureProtocolSigningKey();
    mkdirSync(join(getDataDir(), "org"), { recursive: true });
    writeFileSync(getOrgAuditBridgeConfigPath(), "enabled: true\nevents: []\n", "utf-8");
  });

  afterEach(() => {
    cleanup();
    clearOrgAuditBridgeStateForTests();
  });

  it("maps dispatch queue events to route_dispatch audit type", () => {
    pushQueueEvent({ type: "dispatch_requested", ref: "HO-001" });
    const audit = listAuditEvents({ event: "route_dispatch" })[0];
    expect(audit?.event).toBe("route_dispatch");
    expect(loadProtocolAuditChain().length).toBe(1);
  });

  it("maps work_order queue events to handoff audit type", () => {
    pushQueueEvent({ type: "work_order_created", ref: "WO-001" });
    const audit = listAuditEvents({ event: "handoff" })[0];
    expect(audit?.event).toBe("handoff");
    expect(loadProtocolAuditChain().length).toBe(1);
  });
});
