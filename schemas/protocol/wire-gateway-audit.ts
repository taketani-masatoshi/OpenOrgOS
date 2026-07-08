import { z } from "zod";

export const wireGatewayAuditActionSchema = z.enum([
  "wire.send",
  "wire.receive",
  "wire.reject",
  "wire.auth_fail",
  "wire.sig_fail",
  "wire.replay",
  "wire.legacy_deprecated",
  "internal.api_error",
]);

export const wireGatewayAuditEntrySchema = z.object({
  recorded_at: z.string().datetime({ offset: true }),
  action: wireGatewayAuditActionSchema,
  event_id: z.string().uuid().optional(),
  sender: z.string().optional(),
  receiver: z.string().optional(),
  peer_node_id: z.string().optional(),
  hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  http_status: z.number().int().optional(),
  reason: z.string().optional(),
  gateway_id: z.string().optional(),
});

export type WireGatewayAuditEntry = z.output<typeof wireGatewayAuditEntrySchema>;
