import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildIdentityDocument, buildIdentityEnvelope } from "../src/lib/protocol/identity.js";
import { maybeSignEnvelope } from "../src/lib/protocol/signing.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import {
  envelopeToWireMessage,
  wireMessageToEnvelope,
  assertWireHashMatchesEnvelope,
  wireMessageRoundTrip,
} from "../src/lib/wire-gateway/codec.js";
import {
  validateWireMessage,
  validateWireGatewayConfig,
  buildWireNodeWellKnown,
} from "../src/lib/wire-gateway/validate.js";
import { envelopeDigest } from "../src/lib/protocol/canonical.js";
import { wireMessageSchema } from "../schemas/protocol/wire-message.js";
import { wireGatewayConfigSchema } from "../schemas/protocol/wire-gateway-config.js";
import { wireExportPolicySchema } from "../schemas/protocol/wire-export-policy.js";
import { wireGatewayAuditEntrySchema } from "../schemas/protocol/wire-gateway-audit.js";
import { resetRuntimeContext, setRuntimeContext } from "../src/lib/runtime-context.js";

describe("wire-gateway codec (WG-0)", () => {
  beforeEach(() => {
    setTenantId("demo");
    ensureProtocolSigningKey();
  });

  it("encodes signed envelope to WireMessage", () => {
    const doc = buildIdentityDocument();
    const envelope = maybeSignEnvelope(
      buildIdentityEnvelope(doc, { org_id: "partner", org_uri: "steward://tenant/partner" })
    );
    const wire = envelopeToWireMessage(envelope, { nonce: "fixednonce12345678" });
    expect(wire.wireVersion).toBe("0.1");
    expect(wire.eventId).toBe(envelope.event_id);
    expect(wire.eventType).toBe("org.identity.presented");
    expect(wire.hash).toBe(envelopeDigest(envelope));
    expect(wire.nonce).toBe("fixednonce12345678");
    wireMessageSchema.parse(wire);
  });

  it("round-trips envelope through wire format", () => {
    const doc = buildIdentityDocument();
    const signed = maybeSignEnvelope(
      buildIdentityEnvelope(doc, { org_id: "partner", org_uri: "steward://tenant/partner" })
    );
    const { wire, envelope } = wireMessageRoundTrip(signed);
    expect(envelope.event_id).toBe(signed.event_id);
    expect(envelope.event.type).toBe(signed.event.type);
    expect(wire.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("wire hash matches envelope digest after decode", () => {
    const doc = buildIdentityDocument();
    const signed = maybeSignEnvelope(
      buildIdentityEnvelope(doc, { org_id: "partner", org_uri: "steward://tenant/partner" })
    );
    const wire = envelopeToWireMessage(signed);
    assertWireHashMatchesEnvelope(wire);
    const decoded = wireMessageToEnvelope(wire);
    expect(decoded.signature).toBe(signed.signature);
  });

  it("rejects unsigned envelope encode", () => {
    const doc = buildIdentityDocument();
    const unsigned = buildIdentityEnvelope(doc, {
      org_id: "partner",
      org_uri: "steward://tenant/partner",
    });
    expect(() => envelopeToWireMessage(unsigned)).toThrow(/signed/);
  });

  it("maps receiver node id from destination org_id", () => {
    const doc = buildIdentityDocument();
    const signed = maybeSignEnvelope(
      buildIdentityEnvelope(doc, { org_id: "org.partner.example" })
    );
    const wire = envelopeToWireMessage(signed);
    expect(wire.receiver).toBe("org.partner.example");
    const decoded = wireMessageToEnvelope(wire);
    expect(decoded.destination?.org_id).toBe("org.partner.example");
  });

  it("preserves OpenOrg pk-DID sender through wire decode (hash stable)", () => {
    const prev = process.env.ORGOS_REQUIRE_PK_DID;
    process.env.ORGOS_REQUIRE_PK_DID = "1";
    try {
      const doc = buildIdentityDocument();
      expect(doc.org_ref.org_id).toMatch(/^did:ooo:org:pk-/);
      const signed = maybeSignEnvelope(
        buildIdentityEnvelope(doc, {
          org_id: "did:ooo:org:pk-deadbeefdeadbeef",
          org_uri: "did:ooo:org:pk-deadbeefdeadbeef",
        })
      );
      const wire = envelopeToWireMessage(signed);
      expect(wire.sender).toMatch(/^did:ooo:org:pk-/);
      assertWireHashMatchesEnvelope(wire);
      const decoded = wireMessageToEnvelope(wire);
      expect(decoded.origin.org_id).toBe(wire.sender);
      expect(decoded.origin.org_uri).toBe(wire.sender);
    } finally {
      if (prev === undefined) delete process.env.ORGOS_REQUIRE_PK_DID;
      else process.env.ORGOS_REQUIRE_PK_DID = prev;
    }
  });

  it("uses the injected clock and UUID for identity events", () => {
    setRuntimeContext({
      clock: {
        now: () => new Date("2026-07-12T01:02:03.000Z"),
        nowMs: () => Date.parse("2026-07-12T01:02:03.000Z"),
        nowIso: () => "2026-07-12T01:02:03.000Z",
      },
      idGenerator: {
        randomSuffix: () => "fixed",
        uniqueId: (prefix) => `${prefix}-fixed`,
        uuid: () => "00000000-0000-4000-8000-000000000902",
      },
    });
    try {
      const doc = buildIdentityDocument();
      const envelope = buildIdentityEnvelope(doc);
      expect(doc.issued_at).toBe("2026-07-12T01:02:03.000Z");
      expect(envelope.occurred_at).toBe("2026-07-12T01:02:03.000Z");
      expect(envelope.event_id).toBe("00000000-0000-4000-8000-000000000902");
    } finally {
      resetRuntimeContext();
    }
  });
});

describe("wire-gateway validate (WG-0)", () => {
  it("validates WireMessage schema", () => {
    const result = validateWireMessage({
      wireVersion: "0.1",
      protocolVersion: "1",
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      eventType: "org.transaction.recorded",
      sender: "org.a.example",
      receiver: "org.b.example",
      timestamp: "2026-07-07T09:00:00.000Z",
      nonce: "abcd1234efgh5678",
      hash: "a".repeat(64),
      signature: "sig",
      payload: {},
      identity: { org_ref: { org_id: "org.a.example" } },
    });
    expect(result.ok).toBe(true);
    expect(result.message?.eventId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("validates gateway config schema", () => {
    const cfg = wireGatewayConfigSchema.parse({
      node_id: "org.example.co.jp",
      internal_api: {
        base_url: "http://127.0.0.1:8080/internal/v1/wire",
        bearer_token: "dev-token",
      },
    });
    const result = validateWireGatewayConfig(cfg);
    expect(result.ok).toBe(true);
  });

  it("flags missing internal auth", () => {
    const cfg = wireGatewayConfigSchema.parse({
      node_id: "org.example.co.jp",
      internal_api: {
        base_url: "http://127.0.0.1:8080/internal/v1/wire",
      },
    });
    const result = validateWireGatewayConfig(cfg);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "internal_auth_missing")).toBe(true);
  });

  it("builds well-known node document", () => {
    const cfg = wireGatewayConfigSchema.parse({
      node_id: "org.example.co.jp",
      internal_api: {
        base_url: "http://127.0.0.1:8080/internal/v1/wire",
        bearer_token: "x",
      },
    });
    const doc = buildWireNodeWellKnown(cfg, "https://wire.example.co.jp");
    expect(doc.endpoints.events_push).toBe("https://wire.example.co.jp/wire/v1/events");
    expect(doc.node_id).toBe("org.example.co.jp");
  });
});

describe("wire-gateway WG-0 schemas", () => {
  it("parses export policy example", () => {
    const policy = wireExportPolicySchema.parse({
      version: "1",
      default_allowed: false,
      rules: [{ peer_node_id: "org.partner.example", allowed: true }],
    });
    expect(policy.rules).toHaveLength(1);
  });

  it("parses audit entry", () => {
    const entry = wireGatewayAuditEntrySchema.parse({
      recorded_at: "2026-07-07T09:00:00.000Z",
      action: "wire.receive",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      sender: "org.a.example",
      receiver: "org.b.example",
      hash: "a".repeat(64),
      http_status: 202,
    });
    expect(entry.action).toBe("wire.receive");
  });
});
