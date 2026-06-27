import { z } from "zod";
import { orgActivityScopeSchema } from "./scope.js";
import { operatorAttestationSchema } from "./operator-attestation.js";

export const orgAuditAttestationKindSchema = z.enum([
  "approval.granted",
  "approval.rejected",
  /** @deprecated Prefer approval.granted with scope wire */
  "wire.approved",
]);

export const orgAuditAttestationPayloadSchema = z.object({
  scope: orgActivityScopeSchema,
  kind: orgAuditAttestationKindSchema,
  approval_id: z.string().min(1),
  subject_type: z.string().min(1),
  subject_ref: z.string().optional(),
  operator_attestation: operatorAttestationSchema,
  transaction_id: z.string().optional(),
  transaction_type: z.string().optional(),
  wire_event_id: z.string().uuid().optional(),
  /** @deprecated Use approval_id */
  notice_id: z.string().optional(),
});

export type OrgAuditAttestationKind = z.output<typeof orgAuditAttestationKindSchema>;
export type OrgAuditAttestationPayload = z.output<typeof orgAuditAttestationPayloadSchema>;
