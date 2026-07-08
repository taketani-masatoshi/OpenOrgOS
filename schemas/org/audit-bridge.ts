import { z } from "zod";
import { auditEventTypeSchema } from "../audit-log.js";

/** All operational audit events eligible for bridge when `events: []`. */
export const ORG_AUDIT_BRIDGE_EVENT_TYPES = auditEventTypeSchema.options;

export const orgAuditBridgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Empty = bridge all operational audit events listed in ORG_AUDIT_BRIDGE_EVENT_TYPES. */
  events: z.array(auditEventTypeSchema).default([]),
});

export type OrgAuditBridgeConfig = z.output<typeof orgAuditBridgeConfigSchema>;

/** Recommended tenant config — see steward/platform/org/audit-bridge.yaml.example */
export const orgAuditBridgeRecommendedConfig: OrgAuditBridgeConfig = {
  enabled: true,
  events: [],
};
