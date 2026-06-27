import { z } from "zod";

export const wireRelayEntrySchema = z.object({
  relay_id: z.string().uuid(),
  origin_org_uri: z.string().min(1),
  destination_org_uri: z.string().min(1),
  event_id: z.string().uuid(),
  envelope_digest: z.string().regex(/^[a-f0-9]{64}$/),
  enqueued_at: z.string().min(1),
  delivered_at: z.string().optional(),
  envelope_path: z.string().optional(),
});

export const wireRelayRegistrySchema = z.object({
  as_of: z.string().optional(),
  queue: z.array(wireRelayEntrySchema).default([]),
});

export type WireRelayEntry = z.output<typeof wireRelayEntrySchema>;
export type WireRelayRegistry = z.output<typeof wireRelayRegistrySchema>;
