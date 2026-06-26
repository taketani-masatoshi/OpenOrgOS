import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR, writeYamlFile } from "../src/lib/utils.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { startHubServer } from "../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import { registerHubAttestation } from "../src/lib/hub/receipt.js";
import { syncFromPeer } from "../src/lib/hub/gossip-sync.js";
import { loadGossipCursor } from "../src/lib/hub/federation.js";
import { witnessAttestationSchema } from "../schemas/protocol/witness-attestation.js";
import { hubFederationSchema } from "../schemas/protocol/hub-federation.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";
import { signWitnessAttestation } from "../src/lib/protocol/witness-attestation-crypto.js";

const HUB_A = join(ROOT_DIR, "scratch", "gossip-sync-a");
const HUB_B = join(ROOT_DIR, "scratch", "gossip-sync-b");

describe("hub gossip sync", () => {
  let serverA: { close: () => void };
  let serverB: { close: () => void };

  beforeEach(async () => {
    rmSync(HUB_A, { recursive: true, force: true });
    rmSync(HUB_B, { recursive: true, force: true });
    mkdirSync(HUB_A, { recursive: true });
    mkdirSync(HUB_B, { recursive: true });

    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A });
    const hubAKey = exportHubPublicKeyBase64();
    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B });
    const hubBKey = exportHubPublicKeyBase64();

    writeYamlFile(
      join(HUB_B, "hub-federation.yaml"),
      hubFederationSchema.parse({
        hub_id: "HUB-B",
        hub_peers: [{ hub_id: "HUB-A", hub_url: "http://127.0.0.1:19483", hub_public_key: hubAKey, priority: 1 }],
        gossip: { enabled: true, interval_sec: 300 },
      })
    );

    serverA = await startHubServer({ hubId: "HUB-A", dataDir: HUB_A, host: "127.0.0.1", port: 19483 });
    serverB = await startHubServer({ hubId: "HUB-B", dataDir: HUB_B, host: "127.0.0.1", port: 19484 });

    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A });
    ensureProtocolSigningKey();
    const orgKey = exportProtocolPublicKeyBase64()!;
    const privateKeyPem = ensureProtocolSigningKey();
    const unsigned = {
      event_id: "e1e2f3a4-b5c6-4789-a012-3456789abcde",
      envelope_digest: "b".repeat(64),
      side: "sent" as const,
      origin: { org_id: "mal" },
      destination: { org_id: "southwood" },
      transaction_type: "contract.execution.notice" as const,
      attested_at: new Date().toISOString(),
      org_ref: { org_id: "mal" },
      org_public_key: orgKey,
    };
    const att = signWitnessAttestation(unsigned, privateKeyPem);
    witnessAttestationSchema.parse(att);
    registerHubAttestation(att);
  });

  afterEach(() => {
    serverA.close();
    serverB.close();
    rmSync(HUB_A, { recursive: true, force: true });
    rmSync(HUB_B, { recursive: true, force: true });
  });

  it("syncFromPeer pulls attestations and updates cursor", async () => {
    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B });
    const result = await syncFromPeer("HUB-A");
    expect(result.imported).toBeGreaterThanOrEqual(1);
    const cursor = loadGossipCursor("HUB-A");
    expect(cursor?.last_recorded_at).toBeTruthy();
  });
});
