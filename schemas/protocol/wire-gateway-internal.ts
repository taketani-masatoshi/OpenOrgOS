import { z } from "zod";
import { eventEnvelopeSchema } from "./org-event.js";
import { wireDeliveryReceiptSchema, wireInboundResultSchema, wireNodeIdentitySchema } from "./wire-message.js";
import { openOrgDidSchema } from "./openorg-did.js";

/** Org Core Internal API — called by Wire Gateway only (localhost / Docker network). */

export const internalWireOutboxEntrySchema = z.object({
  event_id: z.string().uuid(),
  receiver_node_id: z.string().min(1),
  enqueued_at: z.string().datetime({ offset: true }),
  envelope_digest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const internalWireOutboxListSchema = z.object({
  ok: z.literal(true),
  pending: z.array(internalWireOutboxEntrySchema),
});

export const internalWireOutboxEnvelopeSchema = z.object({
  ok: z.literal(true),
  envelope: eventEnvelopeSchema,
});

export const internalWireInboxSubmitSchema = z.object({
  envelope: eventEnvelopeSchema,
  gateway_receipt: z
    .object({
      received_at: z.string().datetime({ offset: true }),
      peer_node_id: z.string().optional(),
      wire_nonce: z.string().optional(),
    })
    .optional(),
});

export const internalWireNodeResponseSchema = z.object({
  ok: z.literal(true),
  node: wireNodeIdentitySchema,
});

export const internalWirePeerEntrySchema = z.object({
  peer_node_id: z.string().min(1),
  peer_id: z.string().optional(),
  peer_node_uri: z.string().optional(),
  peer_did: openOrgDidSchema.optional(),
  display_name: z.string().optional(),
  protocol_public_key: z.string().optional(),
  /** Omitted when peer is inbound-only (receive-only). */
  wire_endpoint: z.string().url().optional(),
  transport: z.enum(["wire_v1", "legacy_webhook"]).default("wire_v1"),
});

export const internalWirePeersResponseSchema = z.object({
  ok: z.literal(true),
  peers: z.array(internalWirePeerEntrySchema),
});

export const internalWireDeliveryReportSchema = wireDeliveryReceiptSchema;

export const internalWirePullResponseSchema = z.object({
  ok: z.boolean(),
  allowed: z.boolean(),
  envelope: eventEnvelopeSchema.optional(),
  reason: z.string().optional(),
});

export const internalWireErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

export type InternalWireOutboxEntry = z.output<typeof internalWireOutboxEntrySchema>;
export type InternalWireInboxSubmit = z.output<typeof internalWireInboxSubmitSchema>;
export type InternalWirePeerEntry = z.output<typeof internalWirePeerEntrySchema>;
