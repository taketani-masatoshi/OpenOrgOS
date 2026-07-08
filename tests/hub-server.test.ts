import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startHubServer } from "../src/lib/hub-server.js";
import { generateProtocolKeyPair } from "../src/lib/protocol/signing.js";
import { signWitnessAttestation } from "../src/lib/protocol/witness-attestation-crypto.js";
import { ROOT_DIR } from "../src/lib/utils.js";

const HUB_DIR = join(ROOT_DIR, "scratch", "hub-server-test");

describe("hub server", () => {
  beforeEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
    mkdirSync(HUB_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
  });

  it("health and attestation POST", async () => {
    const server = await startHubServer({
      hubId: "HUB-A",
      dataDir: HUB_DIR,
      host: "127.0.0.1",
      port: 19474,
    });

    const health = await fetch("http://127.0.0.1:19474/hub/v1/health");
    expect(health.ok).toBe(true);
    const healthBody = (await health.json()) as { hub_id: string };
    expect(healthBody.hub_id).toBe("HUB-A");

    const keys = generateProtocolKeyPair();
    const eventId = "44444444-4444-4444-8444-444444444444";
    const attestation = signWitnessAttestation(
      {
        event_id: eventId,
        envelope_digest: "c".repeat(64),
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

    const res = await fetch("http://127.0.0.1:19474/hub/v1/attestations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attestation),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; receipt?: { hub_id: string } };
    expect(body.ok).toBe(true);
    expect(body.receipt?.hub_id).toBe("HUB-A");

    server.close();
  });

  it("serves /hub/v1/metrics", async () => {
    const server = await startHubServer({
      hubId: "HUB-A",
      dataDir: HUB_DIR,
      host: "127.0.0.1",
      port: 19475,
    });
    try {
      const res = await fetch("http://127.0.0.1:19475/hub/v1/metrics");
      expect(res.ok).toBe(true);
      const body = (await res.json()) as {
        service: string;
        hub_id: string;
        receipts: number;
      };
      expect(body.service).toBe("witness-hub");
      expect(body.hub_id).toBe("HUB-A");
      expect(typeof body.receipts).toBe("number");
    } finally {
      server.close();
    }
  });
});
