import { z } from "zod";

export const peerEndpointModeSchema = z.enum(["push", "relay", "pull"]);

export const peerEndpointSchema = z.object({
  url: z.string().url(),
  priority: z.number().int().positive().default(1),
  mode: peerEndpointModeSchema.default("push"),
});

export type PeerEndpoint = z.output<typeof peerEndpointSchema>;
export type PeerEndpointMode = z.output<typeof peerEndpointModeSchema>;

export type PeerTransport =
  | "wire_v1"
  | "openorgos_p2p"
  | "legacy_webhook"
  | "gov_gateway"
  | "relay";

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
