import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { serializeEventEnvelope } from "./envelope.js";
import { envelopeDigest } from "./canonical.js";
import { findPeer, resolvePeerInboundEndpoints } from "./peers.js";
import { enqueueWirePending, removeWirePending, listWirePending } from "./wire-queue.js";
import { markWireDelivered } from "./wire-delivered.js";
import { enqueueWireRelay, listWireRelayPending } from "./wire-relay-store.js";
import { findEnvelopeFileForWitness } from "./witness-client.js";
import { loadTenantConfig } from "../tenant.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProtocolInboxDir } from "./paths.js";

export interface DeliverEnvelopeResult {
  delivered: boolean;
  queued?: boolean;
  relayed?: boolean;
  endpoint?: string;
  reason: string;
  httpStatus?: number;
}

async function postEnvelopeToUrl(
  envelope: EventEnvelope,
  url: string
): Promise<{ ok: boolean; reason: string; httpStatus?: number }> {
  const body = serializeEventEnvelope(envelope);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Steward-OS/0.8",
    "X-Steward-Format": "envelope",
  };
  try {
    const parsed = new URL(url);
    let res: Response;
    if (parsed.protocol === "https:") {
      const { loadProtocolApiClientConfig } = await import("./protocol-api-config.js");
      const { protocolFetch } = await import("./protocol-tls.js");
      const client = loadProtocolApiClientConfig();
      res = await protocolFetch(url, {
        method: "POST",
        headers,
        body,
        tls: client.tls,
      });
    } else {
      res = await fetch(url, { method: "POST", headers, body });
    }
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}`, httpStatus: res.status };
    }
    return { ok: true, reason: "ok", httpStatus: res.status };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function deliverProtocolEnvelope(
  envelope: EventEnvelope,
  peerId: string
): Promise<DeliverEnvelopeResult> {
  const peer = findPeer(peerId);
  if (!peer) {
    return { delivered: false, reason: "peer not found" };
  }

  const endpoints = resolvePeerInboundEndpoints(peer);
  if (endpoints.length === 0) {
    return { delivered: false, reason: "peer has no inbound endpoints" };
  }

  const errors: string[] = [];
  for (const ep of endpoints) {
    if (ep.mode === "pull") {
      continue;
    }
    const result = await postEnvelopeToUrl(envelope, ep.url);
    if (result.ok) {
      markWireDelivered(peerId, envelope.event_id, ep.url);
      return {
        delivered: true,
        endpoint: ep.url,
        reason: result.reason,
        httpStatus: result.httpStatus,
      };
    }
    errors.push(`${ep.mode}@${ep.url}: ${result.reason}`);
  }

  return {
    delivered: false,
    reason: errors.join("; ") || "all endpoints failed",
  };
}

export async function deliverViaRelayStore(
  envelope: EventEnvelope,
  peerId: string,
  relayUrl: string
): Promise<DeliverEnvelopeResult> {
  const peer = findPeer(peerId);
  const tenant = loadTenantConfig();
  const originOrgUri = `steward://tenant/${tenant.id}`;
  const destinationOrgUri = peer?.org_uri ?? peerId;

  const post = await postEnvelopeToUrl(envelope, relayUrl);
  if (!post.ok) {
    return { delivered: false, reason: `relay POST failed: ${post.reason}` };
  }

  enqueueWireRelay({
    origin_org_uri: originOrgUri,
    destination_org_uri: destinationOrgUri,
    event_id: envelope.event_id,
    envelope_digest: envelopeDigest(envelope),
    envelope_path: undefined,
  });

  return { delivered: true, relayed: true, endpoint: relayUrl, reason: "relay-enqueued" };
}

/** Multipath deliver with store-and-forward on failure. */
export async function deliverProtocolEnvelopeWithRelay(
  envelope: EventEnvelope,
  peerId: string
): Promise<DeliverEnvelopeResult> {
  const result = await deliverProtocolEnvelope(envelope, peerId);
  if (result.delivered) {
    removeWirePending(peerId, envelope.event_id);
    markWireDelivered(peerId, envelope.event_id, result.endpoint);
    return result;
  }

  const peer = findPeer(peerId);
  if (peer) {
    const relayEndpoint = resolvePeerInboundEndpoints(peer).find((e) => e.mode === "relay");
    if (relayEndpoint) {
      const relayResult = await deliverViaRelayStore(envelope, peerId, relayEndpoint.url);
      if (relayResult.delivered) {
        removeWirePending(peerId, envelope.event_id);
        markWireDelivered(peerId, envelope.event_id, relayResult.endpoint);
        return relayResult;
      }
    }
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
    const envelope = findEnvelopeFileForWitness(entry.event_id);
    if (!envelope) continue;

    const result = await deliverProtocolEnvelopeWithRelay(envelope, entry.peer_id);
    if (result.delivered) {
      removeWirePending(entry.peer_id, entry.event_id);
      flushed++;
    } else if (!result.queued) {
      enqueueWirePending({
        ...entry,
        last_error: result.reason,
      });
    }
  }
  return flushed;
}

export async function pullDeliverFromPeerOutbox(
  peerOutboxUrl: string,
  eventId: string
): Promise<DeliverEnvelopeResult & { inboxPath?: string }> {
  const base = peerOutboxUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/protocol/v1/outbox/${eventId}`);
  if (!res.ok) {
    return { delivered: false, reason: `pull failed: HTTP ${res.status}` };
  }
  const body = (await res.json()) as { ok?: boolean; envelope?: EventEnvelope };
  if (!body.envelope) {
    return { delivered: false, reason: "pull: envelope missing" };
  }
  const inboxPath = mirrorInboundEnvelope(body.envelope);
  return { delivered: true, reason: "pull-ok", inboxPath };
}

export { listWireRelayPending };

export function mirrorInboundEnvelope(envelope: EventEnvelope): string {
  const dir = getProtocolInboxDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${envelope.event_id}.json`);
  writeFileSync(path, serializeEventEnvelope(envelope), "utf-8");
  return path;
}
