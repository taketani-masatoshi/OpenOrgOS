import { z } from "zod";

export const etaxAuditEventTypeSchema = z.enum([
  "ETAX_PACKAGE_CREATED",
  "ETAX_XML_GENERATED",
  "ETAX_VALIDATION_COMPLETED",
  "ETAX_VALIDATION_FAILED",
  "ETAX_APPROVAL_GRANTED",
  "ETAX_APPROVAL_INVALIDATED",
  "ETAX_SIGNATURE_CREATED",
  "ETAX_SUBMISSION_REQUESTED",
  "ETAX_SUBMISSION_SENT",
  "ETAX_RECEIPT_RECEIVED",
  "ETAX_SUBMISSION_REJECTED",
  "ETAX_TRANSPORT_ERROR",
]);

export type EtaxAuditEventType = z.output<typeof etaxAuditEventTypeSchema>;

export const etaxAuditEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  tenant: z.string().min(1),
  actor: z.string().min(1),
  action: etaxAuditEventTypeSchema,
  objectId: z.string().min(1),
  contentHash: z.string().optional(),
  specVersion: z.string().optional(),
  result: z.enum(["ok", "blocked", "failed"]),
  detail: z.string().optional(),
});

export type EtaxAuditEvent = z.output<typeof etaxAuditEventSchema>;
