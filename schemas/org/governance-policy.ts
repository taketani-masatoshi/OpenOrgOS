import { z } from "zod";

/** Tenant authority profile — default CEO-concentrated (ADR 0019). */
export const authorityProfileSchema = z.enum([
  "ceo_concentrated",
  /** Reserved — not implemented in this epic. */
  "dual_control",
]);

export const governancePolicySchema = z.object({
  version: z.literal("1"),
  authority_profile: authorityProfileSchema.default("ceo_concentrated"),
  /** When true (default), ceo + auditor must not share stakeholder_id / display_name. */
  forbid_ceo_auditor_overlap: z.boolean().default(true),
});

export type AuthorityProfile = z.output<typeof authorityProfileSchema>;
export type GovernancePolicy = z.output<typeof governancePolicySchema>;

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicy = {
  version: "1",
  authority_profile: "ceo_concentrated",
  forbid_ceo_auditor_overlap: true,
};
