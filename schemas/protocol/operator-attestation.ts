import { z } from "zod";

/** Human operator + approver attestation — not Steward agent autonomy. */
export const operatorAttestationBasisSchema = z.enum([
  "existing_contract",
  "new_contract_instrument",
]);

export const operatorAttestationSchema = z.object({
  operator_id: z.string().min(1),
  approver_id: z.string().min(1),
  approved_at: z.string().min(1),
  basis: operatorAttestationBasisSchema,
  basis_ref: z.string().optional(),
  notice_id: z.string().optional(),
  co_approver_id: z.string().optional(),
  approval_tier: z.enum(["A", "B", "C"]).optional(),
  approval_policy_ref: z.string().default("REG-004"),
});

export type OperatorAttestation = z.output<typeof operatorAttestationSchema>;
export type OperatorAttestationBasis = z.output<typeof operatorAttestationBasisSchema>;
