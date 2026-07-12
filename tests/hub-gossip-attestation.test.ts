import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR, writeYamlFile } from "../src/lib/utils.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { startHubServer } from "../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import { registerHubAttestation, findHubReceiptByEventId } from "../src/lib/hub/receipt.js";
import { importAttestationGossip, exportAttestationGossip } from "../src/lib/hub/gossip-attestation.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";
import { signWitnessAttestation } from "../src/lib/protocol/witness-attestation-crypto.js";
import { hubFederationSchema } from "../schemas/protocol/hub-federation.js";

const HUB_A = join(ROOT_DIR, "scratch", "gossip-attest-a");
const HUB_B = join(ROOT_DIR, "scratch", "gossip-attest-b");

function buildSignedAttestation(eventId: string, side: "sent" | "received") {
  ensureProtocolSigningKey();
  const orgKey = exportProtocolPublicKeyBase64()!;
  const unsigned = {
    event_id: eventId,
    envelope_digest: "a".repeat(64),
    side,
    origin: { org_id: "mal" },
    destination: { org_id: "southwood" },
    transaction_type: "contract.execution.notice" as const,
    attested_at: new Date().toISOString(),
    org_ref: side === "sent" ? { org_id: "mal" } : { org_id: "southwood" },
    org_public_key: orgKey,
  };
  return signWitnessAttestation(unsigned, ensureProtocolSigningKey());
}

describe("hub gossip attestation", () => {
  let serverA: { url: string; close: () => void };
  let serverB: { url: string; close: () => void };
  let hubAKey: string;

  beforeEach(async () => {
    rmSync(HUB_A, { recursive: true, force: true });
    rmSync(HUB_B, { recursive: true, force: true });
    mkdirSync(HUB_A, { recursive: true });
    mkdirSync(HUB_B, { recursive: true });

    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A });
    hubAKey = exportHubPublicKeyBase64();
    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B });
    exportHubPublicKeyBase64();

    serverA = await startHubServer({ hubId: "HUB-A", dataDir: HUB_A, host: "127.0.0.1", port: 0 });
    serverB = await startHubServer({ hubId: "HUB-B", dataDir: HUB_B, host: "127.0.0.1", port: 0 });

    writeYamlFile(
      join(HUB_B, "hub-federation.yaml"),
      hubFederationSchema.parse({
        hub_id: "HUB-B",
        hub_peers: [{ hub_id: "HUB-A", hub_url: serverA.url, hub_public_key: hubAKey, priority: 1 }],
        gossip: { enabled: true, interval_sec: 300 },
      })
    );
  });

  afterEach(() => {
    serverA.close();
    serverB.close();
    rmSync(HUB_A, { recursive: true, force: true });
    rmSync(HUB_B, { recursive: true, force: true });
  });

  it("import rebuilds receipt with local hub_id", () => {
    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B });
    const att = buildSignedAttestation("d1e2f3a4-b5c6-4789-a012-3456789abcde", "sent");
    const result = importAttestationGossip([att]);
    expect(result.imported).toBe(1);
    const receipt = findHubReceiptByEventId(att.event_id);
    expect(receipt?.hub_id).toBe("HUB-B");
  });

  it("exports attestations via HTTP", async () => {
    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A });
    registerHubAttestation(buildSignedAttestation("d2e2f3a4-b5c6-4789-a012-3456789abcde", "sent"));

    const res = await fetch(`${serverA.url}/hub/v1/gossip/attestations`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { attestation_count: number };
    expect(body.attestation_count).toBeGreaterThanOrEqual(1);
  });

  it("exportAttestationGossip paginates", () => {
    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A });
    registerHubAttestation(buildSignedAttestation("d3e2f3a4-b5c6-4789-a012-3456789abcde", "sent"));
    const snap = exportAttestationGossip({ limit: 10 });
    expect(snap.attestation_count).toBe(1);
  });
});
