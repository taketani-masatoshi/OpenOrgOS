import { z } from "zod";
import { orgApprovalTierSchema } from "./tier.js";

/** Human operator + approver attestation — not Steward agent autonomy. */
export const operatorAttestationBasisSchema = z.enum([
  "existing_contract",
  "new_contract_instrument",
  "internal_policy",
  "other",
]);

export const operatorAttestationSchema = z.object({
  operator_id: z.string().min(1),
  approver_id: z.string().min(1),
  approved_at: z.string().min(1),
  basis: operatorAttestationBasisSchema,
  basis_ref: z.string().optional(),
  approval_id: z.string().optional(),
  /** @deprecated Use approval_id */
  notice_id: z.string().optional(),
  co_approver_id: z.string().optional(),
  approval_tier: orgApprovalTierSchema.optional(),
  approval_policy_ref: z.string().optional(),
});

export type OperatorAttestation = z.output<typeof operatorAttestationSchema>;
export type OperatorAttestationBasis = z.output<typeof operatorAttestationBasisSchema>;
