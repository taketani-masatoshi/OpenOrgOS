import { z } from "zod";

export const auditEventTypeSchema = z.enum([
  "handoff",
  "validate",
  "classification_block",
  "escalate",
  "route_dispatch",
]);

export const auditEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  tenant: z.string(),
  event: auditEventTypeSchema,
  ref: z.string(),
  actor: z.string().optional(),
  detail: z.string().optional(),
});

export type AuditEventType = z.output<typeof auditEventTypeSchema>;
export type AuditEvent = z.output<typeof auditEventSchema>;
