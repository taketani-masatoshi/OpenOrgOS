import { z } from "zod";
import { delegationRefSchema, identityRefSchema } from "./org-event.js";
import { openOrgDidSchema } from "./openorg-did.js";

/** Wire Protocol wireVersion — external P2P JSON (I3-a). */
export const wireVersionSchema = z.literal("0.1");

export const wireMessageSchema = z.object({
  wireVersion: wireVersionSchema.default("0.1"),
  protocolVersion: z.literal("1").default("1"),
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  sender: z.string().min(1),
  receiver: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  nonce: z.string().min(8).max(128),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
  payload: z.record(z.unknown()),
  identity: identityRefSchema,
  delegation: delegationRefSchema.optional(),
  /** Optional trace — Gateway passes through without interpretation. */
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
});

export type WireMessage = z.output<typeof wireMessageSchema>;

/** Fields excluded from wireMessageDigest (signature material). */
export const WIRE_MESSAGE_DIGEST_EXCLUDE = ["hash", "signature"] as const;

export const wireNodeIdentitySchema = z.object({
  node_id: z.string().min(1),
  node_uri: z.string().optional(),
  display_name: z.string().optional(),
  protocol_public_key: z.string().min(1),
  wire_version: wireVersionSchema.default("0.1"),
  did: openOrgDidSchema.optional(),
  trust_registry_url: z.string().url().optional(),
});

export type WireNodeIdentity = z.output<typeof wireNodeIdentitySchema>;

/** GET /.well-known/wire-node.json */
export const wireNodeWellKnownSchema = wireNodeIdentitySchema.extend({
  endpoints: z.object({
    events_push: z.string().url(),
    events_pull: z.string().url(),
    health: z.string().url(),
  }),
});

export type WireNodeWellKnown = z.output<typeof wireNodeWellKnownSchema>;

export const wireDeliveryReceiptSchema = z.object({
  event_id: z.string().uuid(),
  delivered: z.boolean(),
  peer_node_id: z.string().optional(),
  http_status: z.number().int().optional(),
  detail: z.string().optional(),
  delivered_at: z.string().datetime({ offset: true }),
});

export type WireDeliveryReceipt = z.output<typeof wireDeliveryReceiptSchema>;

export const wireInboundResultSchema = z.object({
  ok: z.boolean(),
  event_id: z.string().uuid().optional(),
  idempotent: z.boolean().optional(),
  reason: z.string().optional(),
});

export type WireInboundResult = z.output<typeof wireInboundResultSchema>;
