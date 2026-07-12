import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { auditLogPath } from "../src/lib/audit-log.js";

function cleanupProtocolData(): void {
  const paths = [
    join(getDataDir(), "protocol"),
    join(getDocsDir(), "protocol"),
    join(getDocsDir(), "reports", "audit-log"),
  ];
  for (const p of paths) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  const auditPath = auditLogPath();
  if (existsSync(auditPath)) unlinkSync(auditPath);
}

describe("protocol transaction audit separation", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanupProtocolData();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test
counterparty: Peer
type: outsourcing
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
compensation:
  amount: 50000
`,
      "utf-8"
    );
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
  });

  afterEach(() => cleanupProtocolData());

  it("writes audit-chain only — not operational audit.jsonl", () => {
    recordProtocolTransaction({
      transactionType: "obligation.acknowledged",
      peerId: "PEER-001",
      operatorBypass: true,
    });
    expect(existsSync(auditLogPath())).toBe(false);
  });
});
