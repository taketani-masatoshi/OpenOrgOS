import { z } from "zod";

export const ORG_AUDIT_BRIDGE_STATE_MAX_IDS = 5000;

export const orgAuditBridgeStateSchema = z.object({
  bridged_audit_ids: z.array(z.string()).default([]),
  /** Cap retained idempotency keys; oldest dropped when exceeded. */
  max_bridged_ids: z.number().int().positive().default(ORG_AUDIT_BRIDGE_STATE_MAX_IDS),
});

export type OrgAuditBridgeState = z.output<typeof orgAuditBridgeStateSchema>;
