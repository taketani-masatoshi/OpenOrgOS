import { z } from "zod";

export const outboxProvenanceSchema = z.object({
  event_id: z.string().uuid(),
  source: z.string().min(1),
  written_at: z.string().min(1),
  digest: z.string().min(1),
});

export type OutboxProvenance = z.output<typeof outboxProvenanceSchema>;
