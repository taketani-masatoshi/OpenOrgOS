import type {
  WireApprovalGateInput,
  WireApprovalGateResult,
  WireApprovalTier,
} from "../../../../schemas/protocol/wire-approval.js";
import {
  assertApproverAuthorized,
  normalizePersonName,
} from "./approvers.js";
import { resolveJurisdictionApprovalPolicy } from "./policy.js";

export function resolveWireGovernanceTier(amount: number, currency: string): WireApprovalTier {
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

export function assertWireGovernanceApproval(input: WireApprovalGateInput): WireApprovalGateResult {
  const policy = resolveJurisdictionApprovalPolicy();
  const policyRef = input.policyRef ?? policy.policy_ref;
  const tier = resolveWireGovernanceTier(input.amount, input.currency);

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
