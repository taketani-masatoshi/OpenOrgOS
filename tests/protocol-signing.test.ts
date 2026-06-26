import { describe, it, expect } from "vitest";
import type { EventEnvelope } from "../schemas/protocol/org-event.js";
import {
  generateProtocolKeyPair,
  signEventEnvelope,
  verifyEventEnvelopeSignature,
} from "../src/lib/protocol/signing.js";

describe("protocol envelope signing", () => {
  it("signs and verifies Ed25519 digest", () => {
    const { publicKey, privateKeyPem } = generateProtocolKeyPair();
    const envelope: EventEnvelope = {
      protocol_version: "1",
      event_id: "11111111-1111-4111-8111-111111111111",
      occurred_at: "2026-06-26T00:00:00.000Z",
      origin: { org_id: "demo", org_uri: "steward://tenant/demo" },
      destination: { org_id: "PEER-001" },
      correlation_id: "TX-1",
      identity: { org_ref: { org_id: "demo" } },
      event: { type: "org.transaction.recorded", payload: { transaction_type: "invoice.issued" } },
      signature: null,
    };

    const signed = signEventEnvelope(envelope, privateKeyPem);
    expect(signed.signature).toBeTruthy();
    expect(verifyEventEnvelopeSignature(signed, publicKey)).toBe(true);
    expect(verifyEventEnvelopeSignature({ ...signed, signature: "bad" }, publicKey)).toBe(false);
  });
});
