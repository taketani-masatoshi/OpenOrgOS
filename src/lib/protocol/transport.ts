import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { findPeer } from "./peers.js";
import { serializeEventEnvelope } from "./envelope.js";
import { envelopeDigest } from "./canonical.js";
import { findEnvelopeFileForWitness } from "./witness-envelope.js";
import { enqueueWirePending, removeWirePending, listWirePending } from "./wire-queue.js";

export interface DeliverEnvelopeResult {
  delivered: boolean;
  queued?: boolean;
  reason: string;
  httpStatus?: number;
}

export async function deliverProtocolEnvelope(
  envelope: EventEnvelope,
  peerId: string
): Promise<DeliverEnvelopeResult> {
  const peer = findPeer(peerId);
  if (!peer?.inbound_webhook_url) {
    return { delivered: false, reason: "peer has no inbound_webhook_url" };
  }

  const body = serializeEventEnvelope(envelope);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Steward-OS/0.8",
    "X-Steward-Format": "envelope",
  };

  const res = await fetch(peer.inbound_webhook_url, { method: "POST", headers, body });
  if (!res.ok) {
    return { delivered: false, reason: `HTTP ${res.status}`, httpStatus: res.status };
  }
  return { delivered: true, reason: "ok", httpStatus: res.status };
}

/** Deliver with store-and-forward: enqueue on failure for later flush. */
export async function deliverProtocolEnvelopeWithRelay(
  envelope: EventEnvelope,
  peerId: string
): Promise<DeliverEnvelopeResult> {
  const result = await deliverProtocolEnvelope(envelope, peerId);
  if (result.delivered) {
    removeWirePending(peerId, envelope.event_id);
    return result;
  }

  enqueueWirePending({
    peer_id: peerId,
    event_id: envelope.event_id,
    envelope_digest: envelopeDigest(envelope),
    last_error: result.reason,
  });
  return { ...result, queued: true, reason: `queued: ${result.reason}` };
}

export async function flushWirePending(): Promise<number> {
  let flushed = 0;
  for (const entry of listWirePending()) {
    const peer = findPeer(entry.peer_id);
    if (!peer?.inbound_webhook_url) continue;

    const envelope = findEnvelopeFileForWitness(entry.event_id);
    if (!envelope) continue;

    const result = await deliverProtocolEnvelope(envelope, entry.peer_id);
    if (result.delivered) {
      removeWirePending(entry.peer_id, entry.event_id);
      flushed++;
    } else {
      enqueueWirePending({
        ...entry,
        last_error: result.reason,
      });
    }
  }
  return flushed;
}

export { mirrorInboundEnvelope } from "./transport-inbound.js";
