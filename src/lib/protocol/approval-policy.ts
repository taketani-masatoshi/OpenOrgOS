/** REG-004 / jurisdiction approval tiers for inter-org wire. */
import type { Reg004Tier } from "./approval-policy.js";
import {
  assertApproverAuthorized,
  loadAuthorizedApprovers,
  normalizePersonName,
  resolveJurisdictionApprovalPolicy,
} from "./approver-registry.js";
import { loadContract } from "../data.js";

export type { Reg004Tier };

export interface Reg004ApprovalInput {
  amount: number;
  currency: string;
  approverId: string;
  coApproverId?: string;
  policyRef?: string;
}

export interface Reg004ApprovalResult {
  tier: Reg004Tier;
  policyRef: string;
  currency: string;
}

export function resolveReg004Tier(amount: number, currency: string): Reg004Tier {
  const policy = resolveJurisdictionApprovalPolicy();
  if (currency !== policy.currency) {
    throw new Error(
      `Approval policy ${policy.policy_ref} uses ${policy.currency}; got ${currency}`
    );
  }
  if (amount <= policy.tiers.A.max_amount!) return "A";
  if (amount <= policy.tiers.B.max_amount!) return "B";
  return "C";
}

export function assertReg004Approval(input: Reg004ApprovalInput): Reg004ApprovalResult {
  const policy = resolveJurisdictionApprovalPolicy();
  const policyRef = input.policyRef ?? policy.policy_ref;
  const tier = resolveReg004Tier(input.amount, input.currency);

  if (!input.approverId.trim()) {
    throw new Error(`${policyRef}: approver_id is required`);
  }

  assertApproverAuthorized(input.approverId, tier);

  if (tier === "A") {
    return { tier, policyRef, currency: input.currency };
  }

  if (tier === "B") {
    if (!input.coApproverId?.trim()) {
      throw new Error(
        `${policyRef} tier B (${input.amount} ${input.currency}): requires --co-approver (${policy.tiers.B.approvers} authorized signatories)`
      );
    }
    if (normalizePersonName(input.coApproverId) === normalizePersonName(input.approverId)) {
      throw new Error(`${policyRef} tier B: approver and co-approver must be distinct`);
    }
    assertApproverAuthorized(input.coApproverId, tier);
    return { tier, policyRef, currency: input.currency };
  }

  throw new Error(`${policyRef} tier C: board resolution required`);
}

export function resolveNoticeAmount(notice: {
  amount?: { value: number; currency: string };
  contract_id?: string;
}): { value: number; currency: string } {
  if (notice.amount) return notice.amount;
  if (notice.contract_id) {
    const contract = loadContract(notice.contract_id);
    const value = contract?.compensation?.amount ?? contract?.monthly_cost;
    if (value != null) {
      const policy = resolveJurisdictionApprovalPolicy();
      return { value, currency: policy.currency };
    }
  }
  const policy = resolveJurisdictionApprovalPolicy();
  return { value: 0, currency: policy.currency };
}

export { loadAuthorizedApprovers, normalizePersonName, resolveJurisdictionApprovalPolicy };
