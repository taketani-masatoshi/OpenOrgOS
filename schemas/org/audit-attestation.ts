import { z } from "zod";
import { orgActivityScopeSchema } from "./scope.js";
import { operatorAttestationSchema } from "./operator-attestation.js";

export const orgAuditAttestationKindSchema = z.enum([
  "approval.granted",
  "approval.rejected",
  "operational.recorded",
  /** @deprecated Legacy chain entries only — use approval.granted with scope wire */
  "wire.approved",
]);

export const orgAuditAttestationPayloadSchema = z
  .object({
    scope: orgActivityScopeSchema,
    kind: orgAuditAttestationKindSchema,
    approval_id: z.string().min(1),
    subject_type: z.string().min(1),
    subject_ref: z.string().optional(),
    operator_attestation: operatorAttestationSchema.optional(),
    reject_reason: z.string().optional(),
    operational: z
      .object({
        audit_id: z.string(),
        audit_event: z.string(),
        actor: z.string().optional(),
        detail: z.string().optional(),
        timestamp: z.string(),
        event_id: z.string().optional(),
        transaction_id: z.string().optional(),
      })
      .optional(),
    transaction_id: z.string().optional(),
    transaction_type: z.string().optional(),
    wire_event_id: z.string().uuid().optional(),
    /** @deprecated Use approval_id */
    notice_id: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (
      (val.kind === "approval.granted" || val.kind === "approval.rejected") &&
      !val.operator_attestation
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${val.kind} requires operator_attestation`,
        path: ["operator_attestation"],
      });
    }
  });

export type OrgAuditAttestationKind = z.output<typeof orgAuditAttestationKindSchema>;
export type OrgAuditAttestationPayload = z.output<typeof orgAuditAttestationPayloadSchema>;
