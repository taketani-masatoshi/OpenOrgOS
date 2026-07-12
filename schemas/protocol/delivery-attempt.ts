import { z } from "zod";

export const deliveryChannelSchema = z.enum([
  "wire_v1",
  "relay",
  "email_wire",
  "openorgos_p2p",
  "legacy_webhook",
]);

export const deliveryAttemptStatusSchema = z.enum(["success", "failed", "queued", "skipped"]);

export const deliveryAttemptSchema = z.object({
  event_id: z.string().uuid(),
  peer_id: z.string().min(1),
  channel: deliveryChannelSchema,
  status: deliveryAttemptStatusSchema,
  at: z.string().min(1),
  /** outbound = tenant send · inbound = email_wire scan ingest */
  direction: z.enum(["outbound", "inbound"]).optional(),
  error: z.string().optional(),
  smtp_message_id: z.string().optional(),
  endpoint: z.string().optional(),
});

export const deliveryAttemptsRegistrySchema = z.object({
  as_of: z.string().optional(),
  attempts: z.array(deliveryAttemptSchema).default([]),
});

export type DeliveryChannel = z.output<typeof deliveryChannelSchema>;
export type DeliveryAttemptStatus = z.output<typeof deliveryAttemptStatusSchema>;
export type DeliveryAttempt = z.output<typeof deliveryAttemptSchema>;
export type DeliveryAttemptsRegistry = z.output<typeof deliveryAttemptsRegistrySchema>;
