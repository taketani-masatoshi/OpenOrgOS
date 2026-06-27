import { z } from "zod";

/** National / jurisdiction layer — approval authority thresholds (REG-*-004 family). */
export const jurisdictionApprovalTierSchema = z.object({
  max_amount: z.number().optional(),
  approvers: z.number().int().min(1).optional(),
  board_required: z.boolean().optional(),
  roles: z.array(z.string()).default([]),
});

export const jurisdictionApprovalPolicySchema = z.object({
  policy_ref: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("JPY"),
  tiers: z.object({
    A: jurisdictionApprovalTierSchema,
    B: jurisdictionApprovalTierSchema,
    C: jurisdictionApprovalTierSchema,
  }),
});

export const jurisdictionWireGovernanceRegistrySchema = z.object({
  version: z.string(),
  jurisdictions: z.record(z.string(), jurisdictionApprovalPolicySchema),
});

export type JurisdictionApprovalPolicy = z.output<typeof jurisdictionApprovalPolicySchema>;
export type JurisdictionWireGovernanceRegistry = z.output<typeof jurisdictionWireGovernanceRegistrySchema>;
