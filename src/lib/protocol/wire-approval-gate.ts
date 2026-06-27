/**
 * Core wire approval gate — delegates materiality rules to jurisdiction wire-governance.
 */
import type {
  WireApprovalGateInput,
  WireApprovalGateResult,
  WireApprovalTier,
} from "../../schemas/protocol/wire-approval.js";
import { loadContract } from "../data.js";
import {
  assertWireGovernanceApproval,
  loadAuthorizedApprovers,
  normalizePersonName,
  resolveJurisdictionApprovalPolicy,
  resolveWireGovernanceTier,
} from "../jurisdiction/wire-governance/index.js";

export type { WireApprovalGateInput, WireApprovalGateResult, WireApprovalTier };

export function assertWireApproval(input: WireApprovalGateInput): WireApprovalGateResult {
  return assertWireGovernanceApproval(input);
}

export function resolveWireApprovalTier(amount: number, currency: string): WireApprovalTier {
  return resolveWireGovernanceTier(amount, currency);
}

export function resolveNoticeAmountForWire(notice: {
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

export {
  loadAuthorizedApprovers,
  normalizePersonName,
  resolveJurisdictionApprovalPolicy,
};

/** @deprecated Use WireApprovalTier */
export type Reg004Tier = WireApprovalTier;

/** @deprecated Use WireApprovalGateInput */
export type Reg004ApprovalInput = WireApprovalGateInput;

/** @deprecated Use WireApprovalGateResult */
export type Reg004ApprovalResult = WireApprovalGateResult;

/** @deprecated Use assertWireApproval */
export const assertReg004Approval = assertWireApproval;

/** @deprecated Use resolveWireApprovalTier */
export const resolveReg004Tier = resolveWireApprovalTier;

/** @deprecated Use resolveNoticeAmountForWire */
export const resolveNoticeAmount = resolveNoticeAmountForWire;
