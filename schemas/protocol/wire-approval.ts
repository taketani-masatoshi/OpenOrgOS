import type { OrgApprovalTier } from "../org/tier.js";
import { orgApprovalTierSchema } from "../org/tier.js";

/** @deprecated Use OrgApprovalTier from schemas/org/tier.js */
export type WireApprovalTier = OrgApprovalTier;

export const wireApprovalTierSchema = orgApprovalTierSchema;

/** Core wire gate — human approver attestation before outbox (jurisdiction fills policy_ref). */
export interface WireApprovalGateInput {
  amount: number;
  currency: string;
  approverId: string;
  coApproverId?: string;
  policyRef?: string;
}

export interface WireApprovalGateResult {
  tier: WireApprovalTier;
  policyRef: string;
  currency: string;
}

export type { OrgApprovalTier };
