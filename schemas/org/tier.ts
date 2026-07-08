import { z } from "zod";

/** Universal materiality tier — jurisdiction maps thresholds and policy_ref. */
export const orgApprovalTierSchema = z.enum(["A", "B", "C"]);

export type OrgApprovalTier = z.output<typeof orgApprovalTierSchema>;
