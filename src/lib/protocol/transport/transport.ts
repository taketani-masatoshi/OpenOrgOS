import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import { serializeEventEnvelope } from "../core/envelope.js";
import { envelopeDigest } from "../core/canonical.js";
import { findPeer, resolvePeerInboundEndpoints } from "./peers.js";
import type { OpenOrgDnsResolver, TrustWireUrlLookup } from "./openorg-dns.js";
import { enqueueWirePending, archiveWirePending, listWirePending } from "./wire-queue.js";
import { markWireDelivered, isWireDelivered } from "./wire-delivered.js";
import { recordDeliveryAttempt } from "./delivery-ledger.js";
import { deliverEnvelopeViaEmailWire } from "../adapters/email-wire-deliver.js";
import { findEnvelopeFileForWitness } from "../distribution/witness-client.js";
import {
  computeNextRetryAt,
  isWirePendingDeadLetter,
  isWirePendingReadyForRetry,
} from "./wire-pending-retry.js";
import { appendWireDeadLetterAudit } from "./wire-dead-letter-audit.js";
import { getTenantId } from "../../tenant.js";
import {
  assertProtocolDeliverGate,
  assertEnvelopeDeliverAuthorized,
} from "./pre-deliver-gate.js";
import {
  isGovGatewayEndpoint,
  isWireV1Endpoint,
  isEmailWireEndpoint,
  isLegacyWebhookEndpoint,
  type PeerEndpoint,
} from "../../../../schemas/protocol/peer-endpoint.js";
import { envelopeToWireMessage } from "./codec.js";
import {
  isPkDidRequired,
  isPkPrefixedOpenOrgDid,
} from "../../../../schemas/protocol/openorg-did.js";
import { assertLegacyWebhookDeliveryAllowed } from "./legacy-webhook-sunset.js";
import type { GovGatewayDeliverFn } from "./gov-gateway-port.js";
import type { DeliverEnvelopeResult } from "./types.js";
import { resolvePeerInboundEndpointsWithDns } from "./dns.js";

export type { GovGatewayDeliverFn } from "./gov-gateway-port.js";
export type { OpenOrgDnsResolver, TrustWireUrlLookup } from "./openorg-dns.js";
export type { DeliverEnvelopeResult } from "./types.js";
export { resolvePeerInboundEndpointsWithDns } from "./dns.js";
export {
  mirrorInboundEnvelope,
  pullDeliverFromPeerOutbox,
} from "./inbound.js";
export {
  flushWireRelayInbox,
  pullOrgCRelayInboxIfConfigured,
  listWireRelayPending,
} from "./relay.js";

export interface DeliverProtocolEnvelopeOptions {
  dnsResolver?: OpenOrgDnsResolver;
  trustLookup?: TrustWireUrlLookup;
  deliverGovGateway?: GovGatewayDeliverFn;
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
  peerId: string,
  opts?: DeliverProtocolEnvelopeOptions
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

  if (isPkDidRequired()) {
    if (!peer.did || !isPkPrefixedOpenOrgDid(peer.did)) {
      return { delivered: false, reason: "receiver_pk_did_required" };
    }
    const originHasPkDid = [envelope.origin.org_id, envelope.origin.org_uri].some(
      (identifier) => !!identifier && isPkPrefixedOpenOrgDid(identifier)
    );
    if (!originHasPkDid) {
      return { delivered: false, reason: "sender_pk_did_required" };
    }
  }

  const endpoints = await resolvePeerInboundEndpointsWithDns(peer, opts);
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
      result = await deliverViaGovGatewayEndpoint(envelope, peerId, ep, opts?.deliverGovGateway);
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
    } else if (isLegacyWebhookEndpoint(ep)) {
      try {
        assertLegacyWebhookDeliveryAllowed(`legacy_webhook deliver to ${peerId}`);
      } catch (error) {
        errors.push(
          `legacy_webhook@${ep.url}: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
      result = await postEnvelopeToUrl(envelope, ep.url, {
        destinationOrgUri: peer.org_uri,
      });
      channel = "openorgos_p2p";
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
  endpoint: PeerEndpoint,
  deliverGovGateway?: GovGatewayDeliverFn
): Promise<{ ok: boolean; reason: string; httpStatus?: number }> {
  if (!deliverGovGateway) {
    return {
      ok: false,
      reason: "gov_gateway deliverer not provided (pass deliverGovGateway in deliver options)",
    };
  }
  const result = await deliverGovGateway({
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
  peerId: string,
  opts?: DeliverProtocolEnvelopeOptions
): Promise<DeliverEnvelopeResult> {
  const result = await deliverProtocolEnvelope(envelope, peerId, opts);
  if (result.delivered) {
    archiveWirePending(peerId, envelope.event_id, "delivered");
    markWireDelivered(peerId, envelope.event_id, result.endpoint);
    return result;
  }

  const peer = findPeer(peerId);
  if (peer) {
    const relayEndpoint = resolvePeerInboundEndpoints(peer).find((e) => e.mode === "relay");
    if (relayEndpoint) {
      const relayResult = await deliverViaRelayStore(envelope, peerId, relayEndpoint.url);
      if (relayResult.delivered) {
        archiveWirePending(peerId, envelope.event_id, "delivered");
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
    next_retry_at: computeNextRetryAt(0),
  });
  return { ...result, queued: true, reason: `queued: ${result.reason}` };
}

export async function flushWirePending(
  opts?: DeliverProtocolEnvelopeOptions
): Promise<number> {
  let flushed = 0;
  for (const entry of listWirePending()) {
    if (isWirePendingDeadLetter(entry)) {
      appendWireDeadLetterAudit(entry);
      archiveWirePending(entry.peer_id, entry.event_id, "dead_letter");
      continue;
    }
    if (!isWirePendingReadyForRetry(entry)) continue;

    const envelope = findEnvelopeFileForWitness(entry.event_id);
    if (!envelope) continue;

    const result = await deliverProtocolEnvelopeWithRelay(envelope, entry.peer_id, opts);
    if (result.delivered) {
      archiveWirePending(entry.peer_id, entry.event_id, "delivered");
      flushed++;
    } else if (!result.queued) {
      const attempts = (entry.attempts ?? 0) + 1;
      enqueueWirePending({
        ...entry,
        attempts,
        last_error: result.reason,
        next_retry_at: computeNextRetryAt(attempts),
      });
    }
  }
  return flushed;
}
