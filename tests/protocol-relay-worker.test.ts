import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { deliverProtocolEnvelopeWithRelay } from "../src/lib/protocol/transport.js";
import { runRelayCycle, loadRelayState } from "../src/lib/protocol/relay-worker.js";
import { listWirePending } from "../src/lib/protocol/wire-queue.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol relay worker", () => {
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
`,
      "utf-8"
    );
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("runRelayCycle records metrics and pending counts", async () => {
    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-1",
      approval_policy_ref: "REG-004",
    });
    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });
    await deliverProtocolEnvelopeWithRelay(envelope, "PEER-001");
    expect(listWirePending()).toHaveLength(1);

    const result = await runRelayCycle({ reconcile: false });
    expect(result.wire_pending).toBeGreaterThanOrEqual(1);
    expect(result.at).toBeTruthy();

    const state = loadRelayState();
    expect(state.cycles).toBeGreaterThanOrEqual(1);
    expect(state.last_metrics?.wire_pending).toBeGreaterThanOrEqual(1);
  });
});
