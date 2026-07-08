import { z } from "zod";

export const protocolAuditRecordSchema = z.object({
  audit_id: z.string().min(1),
  event_id: z.string().uuid(),
  transaction_id: z.string().optional(),
  prev_audit_id: z.string().optional(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  recorded_at: z.string().min(1),
});

export type ProtocolAuditRecord = z.output<typeof protocolAuditRecordSchema>;
