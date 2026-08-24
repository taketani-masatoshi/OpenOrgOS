import { z } from "zod";
import { peerEndpointSchema } from "./peer-endpoint.js";
import { openOrgDidSchema } from "./openorg-did.js";

export const peerProfileSchema = z.object({
  peer_id: z.string().regex(/^PEER-\d{3}$/),
  display_name: z.string().min(1),
  jurisdiction: z.string().min(2),
  stakeholder_id: z.string().optional(),
  org_uri: z.string().optional(),
  /** OpenOrg DID for Wire Node resolution (WG-4). */
  did: openOrgDidSchema.optional(),
  /** Base64 SPKI DER — verifies inbound envelope signatures from this peer. */
  protocol_public_key: z.string().optional(),
  /** @deprecated Prefer inbound_endpoints — kept for backward compatibility. */
  inbound_webhook_url: z.string().url().optional(),
  /** SMTP delivery address for email_wire transport (L1). */
  wire_email: z.string().email().optional(),
  /** Multipath delivery endpoints (push · relay · pull fallback). */
  inbound_endpoints: z.array(peerEndpointSchema).optional(),
  /** Remote transaction ledger for reconcile (GET …/protocol/v1/ledger). */
  ledger_api_url: z.string().url().optional(),
  /** 国税庁法人番号（13桁）— 公表サイト / Web-API 連携用 */
  corporate_number: z.string().regex(/^\d{13}$/).optional(),
  /** 本店所在地（国税庁公表の L1） */
  registered_address: z.string().optional(),
});

export const peersRegistrySchema = z.object({
  as_of: z.string().optional(),
  peers: z.array(peerProfileSchema).default([]),
});

export type PeerProfile = z.output<typeof peerProfileSchema>;
export type PeersRegistry = z.output<typeof peersRegistrySchema>;
