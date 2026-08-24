import { z } from "zod";

export const auditEventTypeSchema = z.enum([
  "handoff",
  "validate",
  "classification_block",
  "escalate",
  "route_dispatch",
  "module_gateway_call",
  "module_capability_decision",
  "module_relay_call",
  "module_policy_decision",
  "module_install",
  "module_capability_grant",
  "llm_governance",
  "module_certification_publish",
  "module_certification_grant",
  "module_certification_revoke",
  "events_chain_rebuild",
  "events_chain_repair",
  "events_signing_key_rotate",
]);

export const auditEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  tenant: z.string(),
  event: auditEventTypeSchema,
  ref: z.string(),
  actor: z.string().optional(),
  detail: z.string().optional(),
  event_id: z.string().uuid().optional(),
  transaction_id: z.string().optional(),
});

export type AuditEventType = z.output<typeof auditEventTypeSchema>;
export type AuditEvent = z.output<typeof auditEventSchema>;
