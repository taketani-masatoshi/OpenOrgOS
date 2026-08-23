import { z } from "zod";

export const companyEventsWitnessPinSchema = z.object({
  version: z.literal(1),
  pinned_at: z.string().min(1),
  chain_tail_seq: z.number().int().nonnegative(),
  chain_tail_digest: z.string().regex(/^[a-f0-9]{64}$/),
  chain_tail_link_id: z.string().min(1),
  hub_id: z.string().optional(),
  event_id: z.string().optional(),
});

export type CompanyEventsWitnessPin = z.output<typeof companyEventsWitnessPinSchema>;
