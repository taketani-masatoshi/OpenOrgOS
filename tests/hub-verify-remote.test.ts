import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startHubServer } from "../src/lib/hub-server.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { generateProtocolKeyPair } from "../src/lib/protocol/signing.js";
import { signWitnessAttestation } from "../src/lib/protocol/witness-attestation-crypto.js";
import { runHubVerify } from "../src/commands/hub.js";
import { ROOT_DIR } from "../src/lib/utils.js";

const HUB_DIR = join(ROOT_DIR, "scratch", "hub-verify-remote-test");

describe("hub verify remote", () => {
  beforeEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
    mkdirSync(HUB_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
  });

  it("verifies receipt via --hub-url", async () => {
    const server = await startHubServer({
      hubId: "HUB-A",
      dataDir: HUB_DIR,
      host: "127.0.0.1",
      port: 19475,
    });

    const keys = generateProtocolKeyPair();
    const eventId = "55555555-5555-4555-8555-555555555555";
    const attestation = signWitnessAttestation(
      {
        event_id: eventId,
        envelope_digest: "d".repeat(64),
        side: "sent",
        origin: { org_id: "mal" },
        destination: { org_id: "southwood" },
        transaction_type: "contract.execution.notice",
        attested_at: new Date().toISOString(),
        org_ref: { org_id: "mal" },
        org_public_key: keys.publicKey,
      },
      keys.privateKeyPem
    );

    const post = await fetch("http://127.0.0.1:19475/hub/v1/attestations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attestation),
    });
    expect(post.status).toBe(201);

    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_DIR });
    await expect(
      runHubVerify({
        hubId: "HUB-A",
        eventId,
        hubUrl: "http://127.0.0.1:19475",
      })
    ).resolves.toBeUndefined();

    server.close();
  });
});
