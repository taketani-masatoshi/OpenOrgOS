import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { pushQueueEvent } from "../src/lib/queue-db.js";
import { listAuditEvents } from "../src/lib/audit-log.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { getOrgAuditBridgeConfigPath } from "../src/lib/org/paths.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org"),
    join(getDataDir(), "protocol"),
    join(getDocsDir(), "reports", "routing-queue"),
    join(getDocsDir(), "reports", "audit-log"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("queue audit bridge mapping", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    mkdirSync(join(getDataDir(), "org"), { recursive: true });
    writeFileSync(getOrgAuditBridgeConfigPath(), "enabled: true\nevents: []\n", "utf-8");
  });

  afterEach(() => cleanup());

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
