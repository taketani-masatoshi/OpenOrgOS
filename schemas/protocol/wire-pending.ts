import { z } from "zod";

export const wirePendingEntrySchema = z.object({
  peer_id: z.string().min(1),
  event_id: z.string().uuid(),
  envelope_digest: z.string().regex(/^[a-f0-9]{64}$/),
  attempts: z.number().int().nonnegative().default(0),
  last_error: z.string().optional(),
  created_at: z.string().min(1),
});

export const wirePendingRegistrySchema = z.object({
  as_of: z.string().optional(),
  pending: z.array(wirePendingEntrySchema).default([]),
});

export type WirePendingEntry = z.output<typeof wirePendingEntrySchema>;
export type WirePendingRegistry = z.output<typeof wirePendingRegistrySchema>;
