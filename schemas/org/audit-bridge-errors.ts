import { z } from "zod";

export const orgAuditBridgeErrorEntrySchema = z.object({
  audit_id: z.string(),
  audit_event: z.string(),
  message: z.string(),
  recorded_at: z.string(),
});

export const orgAuditBridgeErrorsSchema = z.object({
  recent: z.array(orgAuditBridgeErrorEntrySchema).default([]),
  max_entries: z.number().int().positive().default(50),
});

export type OrgAuditBridgeErrorEntry = z.output<typeof orgAuditBridgeErrorEntrySchema>;
export type OrgAuditBridgeErrors = z.output<typeof orgAuditBridgeErrorsSchema>;
