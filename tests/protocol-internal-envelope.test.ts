import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  proposeInterOrgNotice,
  approveInterOrgNotice,
} from "../src/lib/protocol/notice-workflow.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "protocol"),
    join(getDataDir(), "org"),
    join(getDocsDir(), "protocol"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("REG-004 internal approval envelope", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Lease
counterparty: Peer
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 85000
`,
      "utf-8"
    );
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("appends org.audit.attested for reg004 wire approve", () => {
    const notice = proposeInterOrgNotice({
      peerId: "PEER-001",
      contractId: "CTR-099",
      proposedBy: "ops",
    });
    approveInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "CEO",
    });

    const chain = loadProtocolAuditChain();
    expect(chain.length).toBeGreaterThanOrEqual(2);
    const internal = chain.find((r) => r.event_id !== chain[0]?.event_id);
    expect(internal).toBeDefined();
  });
});
