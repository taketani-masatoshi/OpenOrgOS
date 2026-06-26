import { z } from "zod";

export const approvalTierSchema = z.object({
  max_amount: z.number().optional(),
  approvers: z.number().int().min(1).optional(),
  board_required: z.boolean().optional(),
  roles: z.array(z.string()).default([]),
});

export const jurisdictionApprovalPolicySchema = z.object({
  policy_ref: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("JPY"),
  tiers: z.object({
    A: approvalTierSchema,
    B: approvalTierSchema,
    C: approvalTierSchema,
  }),
});

export const approvalThresholdsSchema = z.object({
  version: z.string(),
  jurisdictions: z.record(z.string(), jurisdictionApprovalPolicySchema),
});

export type ApprovalThresholds = z.output<typeof approvalThresholdsSchema>;
export type JurisdictionApprovalPolicy = z.output<typeof jurisdictionApprovalPolicySchema>;
