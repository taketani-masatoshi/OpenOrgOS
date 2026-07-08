import { z } from "zod";
import { witnessAttestationSideSchema } from "./witness-attestation.js";

export const witnessPendingEntrySchema = z.object({
  hub_id: z.string().min(1),
  event_id: z.string().uuid(),
  side: witnessAttestationSideSchema,
  envelope_digest: z.string().regex(/^[a-f0-9]{64}$/),
  attempts: z.number().int().nonnegative().default(0),
  last_error: z.string().optional(),
  created_at: z.string().min(1),
});

export const witnessPendingRegistrySchema = z.object({
  as_of: z.string().optional(),
  pending: z.array(witnessPendingEntrySchema).default([]),
});

export type WitnessPendingEntry = z.output<typeof witnessPendingEntrySchema>;
export type WitnessPendingRegistry = z.output<typeof witnessPendingRegistrySchema>;
