import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { registerHubAttestation, findHubReceiptByEventId } from "../src/lib/hub/receipt.js";
import { generateProtocolKeyPair } from "../src/lib/protocol/signing.js";
import { signWitnessAttestation } from "../src/lib/protocol/witness-attestation-crypto.js";
import type { WitnessAttestation } from "../schemas/protocol/witness-attestation.js";
import { ROOT_DIR } from "../src/lib/utils.js";

const HUB_DIR = join(ROOT_DIR, "scratch", "hub-test-a");

function buildAttestation(
  overrides: Partial<WitnessAttestation> & Pick<WitnessAttestation, "side" | "event_id">
): WitnessAttestation {
  const keys = generateProtocolKeyPair();
  const base = {
    event_id: overrides.event_id,
    envelope_digest: overrides.envelope_digest ?? "a".repeat(64),
    side: overrides.side,
    origin: overrides.origin ?? { org_id: "mal", org_uri: "steward://tenant/mal" },
    destination: overrides.destination ?? {
      org_id: "southwood",
      org_uri: "steward://tenant/southwood",
    },
    transaction_type: "contract.execution.notice",
    attested_at: new Date().toISOString(),
    org_ref:
      overrides.org_ref ??
      (overrides.side === "sent"
        ? { org_id: "mal", org_uri: "steward://tenant/mal" }
        : { org_id: "southwood", org_uri: "steward://tenant/southwood" }),
    org_public_key: keys.publicKey,
  };
  return signWitnessAttestation(base, keys.privateKeyPem);
}

describe("hub registry", () => {
  beforeEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
    mkdirSync(HUB_DIR, { recursive: true });
    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_DIR });
  });

  afterEach(() => {
    rmSync(HUB_DIR, { recursive: true, force: true });
  });

  it("issues unilateral receipt on sent only", () => {
    const eventId = "11111111-1111-4111-8111-111111111111";
    const sent = buildAttestation({ event_id: eventId, side: "sent" });
    const result = registerHubAttestation(sent);
    expect(result.ok).toBe(true);
    const receipt = findHubReceiptByEventId(eventId);
    expect(receipt?.status).toBe("unilateral");
    expect(receipt?.hub_id).toBe("HUB-A");
  });

  it("issues mutually_confirmed when sent and received match digest", () => {
    const eventId = "22222222-2222-4222-8222-222222222222";
    const digest = "b".repeat(64);
    registerHubAttestation(buildAttestation({ event_id: eventId, side: "sent", envelope_digest: digest }));
    registerHubAttestation(
      buildAttestation({ event_id: eventId, side: "received", envelope_digest: digest })
    );
    const receipt = findHubReceiptByEventId(eventId);
    expect(receipt?.status).toBe("mutually_confirmed");
  });

  it("is idempotent for duplicate attestation", () => {
    const eventId = "33333333-3333-4333-8333-333333333333";
    const att = buildAttestation({ event_id: eventId, side: "sent" });
    registerHubAttestation(att);
    const second = registerHubAttestation(att);
    expect(second.ok).toBe(true);
  });
});
