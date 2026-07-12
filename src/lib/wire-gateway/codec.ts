import { randomBytes } from "node:crypto";
import type { EventEnvelope, OrgRef } from "../../../schemas/protocol/org-event.js";
import { eventEnvelopeSchema } from "../../../schemas/protocol/org-event.js";
import {
  wireMessageSchema,
  type WireMessage,
} from "../../../schemas/protocol/wire-message.js";
import { isOpenOrgDid } from "../../../schemas/protocol/openorg-did.js";
import { envelopeDigest } from "../protocol/canonical.js";
import { loadPeersRegistry } from "../protocol/peers.js";

function peerOrgRefFromWireId(nodeId: string): OrgRef | undefined {
  if (!nodeId.startsWith("PEER-")) return undefined;
  const peer = loadPeersRegistry().peers.find((p) => p.peer_id === nodeId);
  if (!peer) return undefined;
  return { org_id: peer.peer_id, org_uri: peer.org_uri };
}

function resolveOrgRef(nodeId: string): OrgRef {
  if (nodeId.startsWith("steward://")) {
    const match = nodeId.match(/^steward:\/\/tenant\/([^/]+)$/);
    return {
      org_id: match?.[1] ?? nodeId,
      org_uri: nodeId,
    };
  }
  if (isOpenOrgDid(nodeId)) {
    return { org_id: nodeId, org_uri: nodeId };
  }
  const peerRef = peerOrgRefFromWireId(nodeId);
  if (peerRef) return peerRef;
  return { org_id: nodeId, org_uri: `steward://tenant/${nodeId}` };
}

export function generateWireNonce(byteLength = 16): string {
  return randomBytes(byteLength).toString("hex");
}

function orgRefToWireString(ref: OrgRef): string {
  const tenantSlug = ref.org_uri?.match(/^steward:\/\/tenant\/([^/]+)$/)?.[1];
  if (ref.org_id && tenantSlug && ref.org_id !== tenantSlug) {
    return ref.org_id;
  }
  if (ref.org_uri?.startsWith("steward://")) {
    return ref.org_uri;
  }
  return ref.org_id;
}

/** EventEnvelope → WireMessage (WG-0 codec). Caller must ensure envelope is signed. */
export function envelopeToWireMessage(
  envelope: EventEnvelope,
  options?: { nonce?: string }
): WireMessage {
  const sender = orgRefToWireString(envelope.origin);
  const receiverRef = envelope.destination;
  if (!receiverRef?.org_id && !receiverRef?.org_uri) {
    throw new Error("envelopeToWireMessage: envelope.destination is required for Wire delivery");
  }
  const receiver = orgRefToWireString(receiverRef);

  const hash = envelopeDigest(envelope);
  if (!envelope.signature) {
    throw new Error("envelopeToWireMessage: envelope must be signed");
  }

  return wireMessageSchema.parse({
    wireVersion: "0.1",
    protocolVersion: "1",
    eventId: envelope.event_id,
    eventType: envelope.event.type,
    sender,
    receiver,
    timestamp: envelope.occurred_at,
    nonce: options?.nonce ?? generateWireNonce(),
    hash,
    signature: envelope.signature,
    payload: envelope.event.payload,
    identity: envelope.identity,
    delegation: envelope.delegation,
    correlationId: envelope.correlation_id,
    causationId: envelope.causation_id,
  });
}

/** WireMessage → EventEnvelope (WG-0 codec). Does not verify signature. */
export function wireMessageToEnvelope(wire: WireMessage): EventEnvelope {
  const parsed = wireMessageSchema.parse(wire);
  const origin = resolveOrgRef(parsed.sender);
  const destination = resolveOrgRef(parsed.receiver);

  return eventEnvelopeSchema.parse({
    protocol_version: parsed.protocolVersion,
    event_id: parsed.eventId,
    occurred_at: parsed.timestamp,
    origin,
    destination,
    correlation_id: parsed.correlationId,
    causation_id: parsed.causationId,
    identity: parsed.identity,
    delegation: parsed.delegation,
    event: {
      type: parsed.eventType,
      payload: parsed.payload,
    },
    signature: parsed.signature,
  });
}

/** Round-trip digest check — hash on wire must match envelope digest. */
export function assertWireHashMatchesEnvelope(wire: WireMessage): void {
  const envelope = wireMessageToEnvelope(wire);
  const expected = envelopeDigest(envelope);
  if (wire.hash !== expected) {
    throw new Error(`wire hash mismatch: expected ${expected}, got ${wire.hash}`);
  }
}

export function wireMessageRoundTrip(envelope: EventEnvelope): {
  wire: WireMessage;
  envelope: EventEnvelope;
} {
  const wire = envelopeToWireMessage(envelope);
  const roundTripped = wireMessageToEnvelope(wire);
  assertWireHashMatchesEnvelope(wire);
  return { wire, envelope: roundTripped };
}
