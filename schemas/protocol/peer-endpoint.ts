import { z } from "zod";
import { govGatewayPeerBindingSchema } from "./gov-gateway-adapter.js";

export const peerEndpointModeSchema = z.enum(["push", "relay", "pull"]);

/**
 * Delivery transport:
 * - wire_v1 — Wire Gateway POST /wire/v1/events (WireMessage) · primary
 * - openorgos_p2p — EventEnvelope direct POST (compat)
 * - legacy_webhook — Steward webhook path · migration only
 * - gov_gateway — national gateway adapter (I3-b)
 * - relay — Org C relay enqueue
 */
export const peerTransportSchema = z.enum([
  "wire_v1",
  "openorgos_p2p",
  "legacy_webhook",
  "gov_gateway",
  "relay",
]);

/** @deprecated use peerTransportSchema — kept for gov-gateway-adapter imports */
export const govGatewayTransportSchema = peerTransportSchema;

export const peerEndpointSchema = z
  .object({
    url: z.string().url(),
    priority: z.number().int().positive().default(1),
    mode: peerEndpointModeSchema.default("push"),
    transport: peerTransportSchema.default("openorgos_p2p"),
    gov_gateway: govGatewayPeerBindingSchema.optional(),
  })
  .refine(
    (ep) => ep.transport !== "gov_gateway" || ep.gov_gateway !== undefined,
    { message: "gov_gateway binding required when transport is gov_gateway", path: ["gov_gateway"] }
  );

export type PeerEndpoint = z.output<typeof peerEndpointSchema>;
export type PeerEndpointMode = z.output<typeof peerEndpointModeSchema>;
export type PeerTransport = z.output<typeof peerTransportSchema>;

export function isGovGatewayEndpoint(ep: PeerEndpoint): boolean {
  return ep.transport === "gov_gateway" && ep.gov_gateway !== undefined;
}

export function isWireV1Endpoint(ep: PeerEndpoint): boolean {
  return ep.transport === "wire_v1" || ep.url.includes("/wire/v1/events");
}

export function isLegacyWebhookEndpoint(ep: PeerEndpoint): boolean {
  return ep.transport === "legacy_webhook";
}

export function isOpenOrgOsP2pEndpoint(ep: PeerEndpoint): boolean {
  return (
    ep.transport === "openorgos_p2p" ||
    ep.transport === "relay" ||
    ep.transport === "legacy_webhook"
  );
}

/** Prefer wire_v1 URL detection when transport omitted on legacy peers. */
export function inferPeerTransport(ep: {
  url: string;
  transport?: PeerTransport;
  mode?: PeerEndpointMode;
}): PeerTransport {
  if (ep.transport && ep.transport !== "openorgos_p2p") return ep.transport;
  if (ep.url.includes("/wire/v1/events")) return "wire_v1";
  if (ep.url.includes("/protocol/v1/relay/")) return "relay";
  if (ep.url.includes("/steward/webhook") || ep.url.includes("/webhook")) return "legacy_webhook";
  return ep.transport ?? "openorgos_p2p";
}
