import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { roundTripEnvelope, parseEventEnvelope } from "../src/lib/protocol/envelope.js";
import { loadProtocolRegistry, validateEnvelopeAgainstRegistry } from "../src/lib/protocol/registry.js";
import { mapQueueEventToOrgEvent } from "../src/lib/protocol/map-internal.js";
import type { QueueEvent } from "../schemas/queue.js";
import { envelopeDigest, canonicalJson } from "../src/lib/protocol/canonical.js";
import { buildIdentityDocument, buildIdentityEnvelope } from "../src/lib/protocol/identity.js";

describe("protocol org event", () => {
  beforeEach(() => setTenantId("demo"));

  it("loads platform registry with four core types", () => {
    const registry = loadProtocolRegistry();
    expect(registry.protocol_version).toBe("1");
    expect(registry.core_event_types).toContain("org.transaction.recorded");
    expect(registry.payload_namespaces).toContain("steward.contract");
  });

  it("round-trips EventEnvelope", () => {
    const doc = buildIdentityDocument();
    const envelope = buildIdentityEnvelope(doc);
    const rt = roundTripEnvelope(envelope);
    expect(rt.event_id).toBe(envelope.event_id);
    expect(rt.event.type).toBe("org.identity.presented");
  });

  it("computes stable canonical digest", () => {
    const doc = buildIdentityDocument();
    const envelope = buildIdentityEnvelope(doc);
    const d1 = envelopeDigest(envelope);
    const d2 = envelopeDigest(parseEventEnvelope(JSON.parse(canonicalJson(envelope))));
    expect(d1).toMatch(/^[a-f0-9]{64}$/);
    expect(d1).toBe(d2);
  });

  it("accepts committee extension types", () => {
    expect(validateEnvelopeAgainstRegistry("committee.work_order.created")).toBeNull();
    expect(validateEnvelopeAgainstRegistry("steward.contract.executed")).toBeNull();
  });

  it("maps queue events to org events", () => {
    const q: QueueEvent = {
      id: "Q-1",
      created_at: new Date().toISOString(),
      tenant: "demo",
      type: "work_order_created",
      ref: "IMP-001",
      status: "pending",
    };
    const org = mapQueueEventToOrgEvent(q);
    expect(org.type).toBe("committee.work_order.created");
    expect(org.payload.ref).toBe("IMP-001");
  });
});

describe("protocol identity export", () => {
  beforeEach(() => setTenantId("demo"));

  it("builds L1 identity document without mandatory corporate number", () => {
    const doc = buildIdentityDocument({ omitCorporateNumber: true });
    expect(doc.display_name.length).toBeGreaterThan(0);
    expect(doc.org_ref.org_id).toBe("demo");
    const envelope = buildIdentityEnvelope(doc);
    expect(envelope.protocol_version).toBe("1");
    expect(envelope.signature).toBeNull();
  });
});
