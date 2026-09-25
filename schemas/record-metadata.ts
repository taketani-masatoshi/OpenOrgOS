import { z } from "zod";

export const recordMetadataSchema = z.object({
  record_id: z.string().min(1),
  record_type: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  captured_at: z.string().datetime({ offset: true }),
  source_system: z.string().min(1),
  source_event_id: z.string().min(1).optional(),
  classification: z.enum(["L0", "L1", "L2", "L3"]),
  retention_until: z.string().date().optional(),
  digest_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  supersedes_record_id: z.string().optional(),
});

export type RecordMetadata = z.output<typeof recordMetadataSchema>;
