import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { reconcileWitnessWithPeer } from "../src/lib/protocol/witness-reconcile.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol witness reconcile", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test
counterparty: Peer Co
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 50000
`,
      "utf-8"
    );
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("reconciles outbound tx with envelope present", async () => {
    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-1",
      approval_policy_ref: "REG-004",
    });
    recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    const result = await reconcileWitnessWithPeer({ peerId: "PEER-001" });
    expect(result.checked).toBe(1);
    expect(result.alerts.filter((a) => a.code === "tx-missing")).toHaveLength(0);
  });
});
