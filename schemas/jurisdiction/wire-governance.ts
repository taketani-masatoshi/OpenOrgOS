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

export const jurisdictionWireGovernancePackEntrySchema = z.object({
  path: z.string().min(1),
  /** sha256 hex of pack file — optional in dev, enforced when set */
  pin: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const jurisdictionWireGovernanceRegistrySchema = z.object({
  version: z.string(),
  packs: z.record(z.string(), jurisdictionWireGovernancePackEntrySchema),
});

/** @deprecated Monolithic registry — use packs + per-jurisdiction files */
export const jurisdictionWireGovernanceLegacyRegistrySchema = z.object({
  version: z.string(),
  jurisdictions: z.record(z.string(), jurisdictionApprovalPolicySchema),
});

export type JurisdictionApprovalPolicy = z.output<typeof jurisdictionApprovalPolicySchema>;
export type JurisdictionWireGovernanceRegistry = z.output<typeof jurisdictionWireGovernanceRegistrySchema>;
