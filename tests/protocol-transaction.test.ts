import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { findTransaction, loadTransactionsRegistry } from "../src/lib/protocol/transactions.js";
import { getProtocolAuditChainPath } from "../src/lib/protocol/paths.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";
import { exportDelegationProof } from "../src/lib/protocol/delegation.js";

function cleanupProtocolData(): void {
  const paths = [
    join(getDataDir(), "protocol"),
    join(getDocsDir(), "protocol"),
    join(getDocsDir(), "reports", "audit-log", "audit.jsonl"),
  ];
  for (const p of paths) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol transaction record", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanupProtocolData();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test Contract
counterparty: Sample Corp
type: outsourcing
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
compensation:
  amount: 50000
`,
      "utf-8"
    );
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Sample Peer",
      jurisdiction: "JP",
    });
  });

  afterEach(() => cleanupProtocolData());

  it("records contract.executed with envelope, audit, and outbox", () => {
    const result = recordProtocolTransaction({
      transactionType: "contract.executed",
      peerId: "PEER-001",
      contractId: "CTR-099",
      operatorBypass: true,
    });

    expect(result.transaction.transaction_id).toMatch(/^TX-\d{8}-\d{3}$/);
    expect(result.envelope.event.type).toBe("org.transaction.recorded");
    expect(result.outboxPath).toBeTruthy();
    expect(existsSync(result.outboxPath!)).toBe(true);

    const tx = findTransaction(result.transaction.transaction_id);
    expect(tx?.refs.contract_id).toBe("CTR-099");
    expect(loadTransactionsRegistry().transactions.length).toBe(1);
    expect(existsSync(getProtocolAuditChainPath())).toBe(true);
  });

  it("inbound execution notice accepts contract_id ref without local contract file", () => {
    const result = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      direction: "inbound",
      contractId: "CTR-012",
      eventId: "00000000-0000-4000-8000-000000000001",
      amount: { value: 85000, currency: "JPY" },
      notes: "peer execution notice",
    });
    expect(result.transaction.refs.contract_id).toBe("CTR-012");
    expect(result.transaction.direction).toBe("inbound");
  });

  it("validate passes for consistent state", () => {
    recordProtocolTransaction({
      transactionType: "obligation.acknowledged",
      peerId: "PEER-001",
      direction: "inbound",
      notes: "test",
    });
    const v = validateProtocolState();
    expect(v.ok, v.issues.map((i) => i.message).join("; ")).toBe(true);
  });

  it("exports delegation proof for contract agent scope", () => {
    const proof = exportDelegationProof({
      scope: "contract.sign",
      granteeAgent: "contract",
    });
    expect(proof.grant.scope).toContain("contract.sign");
    expect(proof.grant.grantor.org_id).toBe("demo");
    expect(proof.basis_ref).toBe("REG-004");
  });
});
