import { z } from "zod";
import { peerEndpointSchema } from "./peer-endpoint.js";

export const peerProfileSchema = z.object({
  peer_id: z.string().regex(/^PEER-\d{3}$/),
  display_name: z.string().min(1),
  jurisdiction: z.string().min(2),
  stakeholder_id: z.string().optional(),
  org_uri: z.string().optional(),
  /** Base64 SPKI DER — verifies inbound envelope signatures from this peer. */
  protocol_public_key: z.string().optional(),
  /** @deprecated Prefer inbound_endpoints — kept for backward compatibility. */
  inbound_webhook_url: z.string().url().optional(),
  /** Multipath delivery endpoints (push · relay · pull fallback). */
  inbound_endpoints: z.array(peerEndpointSchema).optional(),
});

export const peersRegistrySchema = z.object({
  as_of: z.string().optional(),
  peers: z.array(peerProfileSchema).default([]),
});

export type PeerProfile = z.output<typeof peerProfileSchema>;
export type PeersRegistry = z.output<typeof peersRegistrySchema>;
