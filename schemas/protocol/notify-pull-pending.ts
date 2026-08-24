import { z } from "zod";

export const notifyPullPendingEntrySchema = z.object({
  event_id: z.string().uuid(),
  peer_id: z.string().min(1),
  pull_url: z.string().url(),
  sender_did: z.string().optional(),
  enqueued_at: z.string().min(1),
  attempts: z.number().int().nonnegative().default(0),
  last_error: z.string().optional(),
  next_retry_at: z.string().optional(),
});

export const notifyPullPendingRegistrySchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(notifyPullPendingEntrySchema).default([]),
});

export type NotifyPullPendingEntry = z.output<typeof notifyPullPendingEntrySchema>;
export type NotifyPullPendingRegistry = z.output<typeof notifyPullPendingRegistrySchema>;
