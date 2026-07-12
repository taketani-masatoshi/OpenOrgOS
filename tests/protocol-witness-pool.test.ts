import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { ROOT_DIR, writeYamlFile } from "../src/lib/utils.js";
import { getWitnessPoolYamlPath } from "../src/lib/protocol/paths.js";
import { evaluateWitnessQuorum, requiredQuorumCount } from "../src/lib/protocol/witness-quorum.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import { witnessReceiptSchema } from "../schemas/protocol/witness-receipt.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { startHubServer } from "../src/lib/hub-server.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import { registerWitnessAttestationFanOut } from "../src/lib/protocol/witness-client.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";

const HUB_A_DIR = join(ROOT_DIR, "scratch", "witness-pool-hub-a");
const HUB_B_DIR = join(ROOT_DIR, "scratch", "witness-pool-hub-b");

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol witness pool", () => {
  let hubA: { url: string; close: () => void };
  let hubB: { url: string; close: () => void };

  beforeEach(async () => {
    setTenantId("demo");
    cleanup();
    rmSync(HUB_A_DIR, { recursive: true, force: true });
    rmSync(HUB_B_DIR, { recursive: true, force: true });
    mkdirSync(HUB_A_DIR, { recursive: true });
    mkdirSync(HUB_B_DIR, { recursive: true });

    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A_DIR });
    const hubAKey = exportHubPublicKeyBase64();
    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B_DIR });
    const hubBKey = exportHubPublicKeyBase64();

    hubA = await startHubServer({ hubId: "HUB-A", dataDir: HUB_A_DIR, host: "127.0.0.1", port: 0 });
    hubB = await startHubServer({ hubId: "HUB-B", dataDir: HUB_B_DIR, host: "127.0.0.1", port: 0 });

    writeYamlFile(
      getWitnessPoolYamlPath(),
      witnessPoolConfigSchema.parse({
        enabled: true,
        quorum: { mode: "any_of_n" },
        register_on: "both",
        hubs: [
          { hub_id: "HUB-A", hub_url: hubA.url, hub_public_key: hubAKey, priority: 1 },
          { hub_id: "HUB-B", hub_url: hubB.url, hub_public_key: hubBKey, priority: 2 },
        ],
      })
    );

    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    ensureProtocolSigningKey();
  });

  afterEach(() => {
    hubA.close();
    hubB.close();
    cleanup();
    rmSync(HUB_A_DIR, { recursive: true, force: true });
    rmSync(HUB_B_DIR, { recursive: true, force: true });
  });

  it("requiredQuorumCount for any_of_n is 1", () => {
    const pool = witnessPoolConfigSchema.parse({
      enabled: true,
      quorum: { mode: "any_of_n" },
      hubs: [
        { hub_id: "HUB-A", hub_url: "http://x", hub_public_key: "k", priority: 1 },
        { hub_id: "HUB-B", hub_url: "http://y", hub_public_key: "k2", priority: 2 },
      ],
    });
    expect(requiredQuorumCount(pool)).toBe(1);
  });

  it("evaluateWitnessQuorum satisfied with one mutually_confirmed receipt", () => {
    const pool = witnessPoolConfigSchema.parse({
      enabled: true,
      quorum: { mode: "any_of_n" },
      hubs: [{ hub_id: "HUB-A", hub_url: "http://x", hub_public_key: "k", priority: 1 }],
    });
    const receipt = witnessReceiptSchema.parse({
      receipt_id: "R1",
      event_id: "55555555-5555-4555-8555-555555555555",
      envelope_digest: "d".repeat(64),
      status: "mutually_confirmed",
      attestations: [],
      issued_at: new Date().toISOString(),
      hub_id: "HUB-A",
      hub_signature: "sig",
    });
    const q = evaluateWitnessQuorum({
      eventId: receipt.event_id,
      digest: receipt.envelope_digest,
      receipts: [receipt],
      pool,
    });
    expect(q.satisfied).toBe(true);
  });

  it("fan-out registers sent attestation to both hubs", async () => {
    const tx = recordProtocolTransaction({
      transactionType: "obligation.acknowledged",
      peerId: "PEER-001",
      direction: "outbound",
      operatorAttestation: {
        operator_id: "ops",
        approver_id: "CEO",
        approval_tier: "A",
        approved_at: new Date().toISOString(),
        basis: "existing_contract",
        notice_id: "NOTICE-TEST",
        approval_policy_ref: "REG-HK-004",
      },
    });

    const result = await registerWitnessAttestationFanOut({
      envelope: tx.envelope,
      side: "sent",
    });
    expect(result).not.toBeNull();
    expect(result!.succeeded.length).toBe(2);
    expect(result!.failed.length).toBe(0);
  });

  it("partial hub failure still delivers to available hub", async () => {
    hubA.close();
    rmSync(HUB_A_DIR, { recursive: true, force: true });
    mkdirSync(HUB_A_DIR, { recursive: true });
    const hubOnlyA = await startHubServer({
      hubId: "HUB-A",
      dataDir: HUB_A_DIR,
      host: "127.0.0.1",
      port: 0,
    });
    hubB.close();
    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A_DIR });
    const hubAKeyOnly = exportHubPublicKeyBase64();

    writeYamlFile(
      getWitnessPoolYamlPath(),
      witnessPoolConfigSchema.parse({
        enabled: true,
        quorum: { mode: "any_of_n" },
        register_on: "both",
        hubs: [
          { hub_id: "HUB-A", hub_url: hubOnlyA.url, hub_public_key: hubAKeyOnly, priority: 1 },
          { hub_id: "HUB-B", hub_url: hubB.url, hub_public_key: "dummy", priority: 2 },
        ],
      })
    );

    const tx = recordProtocolTransaction({
      transactionType: "obligation.acknowledged",
      peerId: "PEER-001",
      direction: "outbound",
      operatorAttestation: {
        operator_id: "ops",
        approver_id: "CEO",
        approval_tier: "A",
        approved_at: new Date().toISOString(),
        basis: "existing_contract",
        notice_id: "NOTICE-TEST-2",
        approval_policy_ref: "REG-HK-004",
      },
    });

    const result = await registerWitnessAttestationFanOut({
      envelope: tx.envelope,
      side: "sent",
    });
    hubOnlyA.close();
    expect(result!.succeeded.length).toBe(1);
    expect(result!.failed.length).toBe(1);
    expect(result!.receipts.length).toBe(1);
    expect(result!.receipts[0]?.status).toBe("unilateral");
  });
});
