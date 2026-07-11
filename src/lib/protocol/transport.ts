import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { serializeEventEnvelope } from "./envelope.js";
import { envelopeDigest } from "./canonical.js";
import { findPeer, resolvePeerInboundEndpoints } from "./peers.js";
import { enqueueWirePending, removeWirePending, listWirePending } from "./wire-queue.js";
import { markWireDelivered, isWireDelivered } from "./wire-delivered.js";
import { recordDeliveryAttempt } from "./delivery-ledger.js";
import { deliverEnvelopeViaEmailWire } from "./email-wire-deliver.js";
import { listWireRelayPending } from "./wire-relay-store.js";
import { findEnvelopeFileForWitness } from "./witness-client.js";
import { loadTenantConfig, getTenantId } from "../tenant.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProtocolInboxDir } from "./paths.js";
import {
  assertProtocolDeliverGate,
  assertEnvelopeDeliverAuthorized,
} from "./pre-deliver-gate.js";
import {
  isGovGatewayEndpoint,
  isWireV1Endpoint,
  isEmailWireEndpoint,
  type PeerEndpoint,
} from "../../../schemas/protocol/peer-endpoint.js";
import { deliverEnvelopeViaGovGateway } from "../wire/gov-gateway/deliver.js";
import { envelopeToWireMessage } from "../wire-gateway/codec.js";

export interface DeliverEnvelopeResult {
  delivered: boolean;
  queued?: boolean;
  relayed?: boolean;
  endpoint?: string;
  reason: string;
  httpStatus?: number;
}

function isRelayEnqueueUrl(url: string): boolean {
  return url.includes("/protocol/v1/relay/enqueue");
}

async function postJsonToUrl(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; reason: string; httpStatus?: number }> {
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

async function postEnvelopeToUrl(
  envelope: EventEnvelope,
  url: string,
  opts?: { destinationOrgUri?: string }
): Promise<{ ok: boolean; reason: string; httpStatus?: number }> {
  const relay = isRelayEnqueueUrl(url);
  const body = relay
    ? JSON.stringify({
        envelope,
        destination_org_uri:
          opts?.destinationOrgUri ?? envelope.destination?.org_uri ?? envelope.destination?.org_id,
      })
    : serializeEventEnvelope(envelope);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Steward-OS/0.8",
    ...(relay ? {} : { "X-Steward-Format": "envelope" }),
  };
  return postJsonToUrl(url, body, headers);
}

/** Primary path: Wire Gateway wire_v1 — POST WireMessage. */
async function postWireMessageToUrl(
  envelope: EventEnvelope,
  url: string
): Promise<{ ok: boolean; reason: string; httpStatus?: number }> {
  if (!envelope.signature) {
    return { ok: false, reason: "envelope must be signed for wire_v1" };
  }
  const wire = envelopeToWireMessage(envelope);
  const result = await postJsonToUrl(url, JSON.stringify(wire), {
    "Content-Type": "application/json",
    "User-Agent": "Steward-OS/0.8",
    "X-OpenOrgOS-Wire-Version": "0.1",
  });
  if (result.ok || result.httpStatus === 202 || result.httpStatus === 409) {
    return { ok: true, reason: result.reason, httpStatus: result.httpStatus ?? 202 };
  }
  return result;
}

export async function deliverProtocolEnvelope(
  envelope: EventEnvelope,
  peerId: string
): Promise<DeliverEnvelopeResult> {
  assertProtocolDeliverGate();
  assertEnvelopeDeliverAuthorized(envelope, peerId);

  if (isWireDelivered(peerId, envelope.event_id)) {
    recordDeliveryAttempt({
      event_id: envelope.event_id,
      peer_id: peerId,
      channel: "wire_v1",
      status: "skipped",
      error: "E6: already delivered",
    });
    return { delivered: true, reason: "idempotent: already delivered" };
  }

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

    let result: { ok: boolean; reason: string; httpStatus?: number };
    let channel: "wire_v1" | "relay" | "email_wire" | "openorgos_p2p" = "openorgos_p2p";

    if (isGovGatewayEndpoint(ep)) {
      result = await deliverViaGovGatewayEndpoint(envelope, peerId, ep);
      channel = "openorgos_p2p";
    } else if (isEmailWireEndpoint(ep)) {
      const emailResult = await deliverEnvelopeViaEmailWire(envelope, peer, ep.url);
      result = { ok: emailResult.ok, reason: emailResult.reason };
      channel = "email_wire";
      recordDeliveryAttempt({
        event_id: envelope.event_id,
        peer_id: peerId,
        channel,
        status: emailResult.ok ? "success" : "failed",
        direction: "outbound",
        endpoint: ep.url,
        error: emailResult.ok ? undefined : emailResult.reason,
        smtp_message_id: emailResult.smtpMessageId,
      });
    } else if (isWireV1Endpoint(ep)) {
      result = await postWireMessageToUrl(envelope, ep.url);
      channel = "wire_v1";
    } else {
      result = await postEnvelopeToUrl(envelope, ep.url, {
        destinationOrgUri: peer.org_uri,
      });
      channel = ep.transport === "relay" ? "relay" : "openorgos_p2p";
    }

    if (result.ok) {
      if (channel !== "email_wire") {
        recordDeliveryAttempt({
          event_id: envelope.event_id,
          peer_id: peerId,
          channel,
          status: "success",
          endpoint: ep.url,
        });
      }
      markWireDelivered(peerId, envelope.event_id, ep.url);
      return {
        delivered: true,
        endpoint: ep.url,
        reason: result.reason,
        httpStatus: result.httpStatus,
      };
    }
    if (channel !== "email_wire") {
      recordDeliveryAttempt({
        event_id: envelope.event_id,
        peer_id: peerId,
        channel,
        status: "failed",
        endpoint: ep.url,
        error: result.reason,
      });
    }
    errors.push(`${ep.transport}@${ep.url}: ${result.reason}`);
  }

  return {
    delivered: false,
    reason: errors.join("; ") || "all endpoints failed",
  };
}

async function deliverViaGovGatewayEndpoint(
  envelope: EventEnvelope,
  peerId: string,
  endpoint: PeerEndpoint
): Promise<{ ok: boolean; reason: string; httpStatus?: number }> {
  const result = await deliverEnvelopeViaGovGateway({
    envelope,
    peerId,
    endpoint,
    tenantId: getTenantId(),
  });
  return {
    ok: result.ok,
    reason: result.reason,
    httpStatus: result.httpStatus,
  };
}

export async function deliverViaRelayStore(
  envelope: EventEnvelope,
  peerId: string,
  relayUrl: string
): Promise<DeliverEnvelopeResult> {
  const peer = findPeer(peerId);
  const destinationOrgUri = peer?.org_uri ?? peerId;

  const post = await postEnvelopeToUrl(envelope, relayUrl, { destinationOrgUri });
  if (!post.ok) {
    return { delivered: false, reason: `relay POST failed: ${post.reason}` };
  }

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

function relayApiOrigin(bundleOrApiUrl: string): string {
  return new URL(bundleOrApiUrl).origin;
}

/** Receiver pulls pending envelopes from Org C relay API (Proposal 3). */
export async function flushWireRelayInbox(relayApiBase: string): Promise<number> {
  const { ingestWebhook } = await import("../webhook.js");
  const tenant = loadTenantConfig();
  const destinationOrgUri = `steward://tenant/${tenant.id}`;
  const base = relayApiOrigin(relayApiBase);
  const inboxUrl = `${base}/protocol/v1/relay/inbox?destination_org_uri=${encodeURIComponent(destinationOrgUri)}`;

  const { protocolHttpFetch } = await import("./protocol-http-client.js");
  let res: Response;
  try {
    res = await protocolHttpFetch(inboxUrl);
  } catch {
    return 0;
  }
  if (!res.ok) return 0;

  const body = (await res.json()) as {
    ok?: boolean;
    queue?: Array<{
      relay_id: string;
      event_id: string;
      envelope?: EventEnvelope;
    }>;
  };
  if (!body.ok || !body.queue?.length) return 0;

  let pulled = 0;
  for (const entry of body.queue) {
    if (!entry.envelope) continue;
    const ingest = ingestWebhook({ raw: entry.envelope });
    if (!ingest.ok && ingest.reason !== "idempotent") continue;
    try {
      await protocolHttpFetch(`${base}/protocol/v1/relay/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relay_id: entry.relay_id }),
      });
    } catch {
      /* ack best-effort */
    }
    pulled++;
  }
  return pulled;
}

/** Pull Org C relay for any contract with witness_trust_bundle_url. */
export async function pullOrgCRelayInboxIfConfigured(): Promise<number> {
  const { loadContracts } = await import("../data.js");
  let total = 0;
  const seen = new Set<string>();
  for (const contract of loadContracts()) {
    const bundleUrl = contract.protocol?.witness_trust_bundle_url;
    if (!bundleUrl) continue;
    const origin = relayApiOrigin(bundleUrl);
    if (seen.has(origin)) continue;
    seen.add(origin);
    total += await flushWireRelayInbox(origin);
  }
  return total;
}

export function mirrorInboundEnvelope(envelope: EventEnvelope): string {
  const dir = getProtocolInboxDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${envelope.event_id}.json`);
  writeFileSync(path, serializeEventEnvelope(envelope), "utf-8");
  return path;
}
