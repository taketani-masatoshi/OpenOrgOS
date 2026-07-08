import { z } from "zod";

export const wireDeliveredEntrySchema = z.object({
  peer_id: z.string().min(1),
  event_id: z.string().uuid(),
  delivered_at: z.string().min(1),
  endpoint: z.string().optional(),
});

export const wireDeliveredRegistrySchema = z.object({
  as_of: z.string().optional(),
  delivered: z.array(wireDeliveredEntrySchema).default([]),
});

export type WireDeliveredEntry = z.output<typeof wireDeliveredEntrySchema>;
export type WireDeliveredRegistry = z.output<typeof wireDeliveredRegistrySchema>;
