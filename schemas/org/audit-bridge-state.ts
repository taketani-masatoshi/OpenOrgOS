import { z } from "zod";

export const orgAuditBridgeStateSchema = z.object({
  bridged_audit_ids: z.array(z.string()).default([]),
});

export type OrgAuditBridgeState = z.output<typeof orgAuditBridgeStateSchema>;
