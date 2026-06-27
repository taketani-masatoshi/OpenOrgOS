/**
 * Core approval gate — tier A/B/C only. Thresholds live in jurisdiction wire-governance.
 */
import type {
  WireApprovalGateInput,
  WireApprovalGateResult,
  WireApprovalTier,
} from "../../schemas/protocol/wire-approval.js";
import { assertWireGovernanceApproval, resolveWireGovernanceTier } from "../jurisdiction/wire-governance/index.js";

export type { WireApprovalGateInput, WireApprovalGateResult, WireApprovalTier };

export function assertOrgApprovalGate(input: WireApprovalGateInput): WireApprovalGateResult {
  return assertWireGovernanceApproval(input);
}

export function resolveOrgApprovalTier(amount: number, currency: string): WireApprovalTier {
  return resolveWireGovernanceTier(amount, currency);
}

/** @deprecated Use assertOrgApprovalGate */
export const assertWireApproval = assertOrgApprovalGate;

/** @deprecated Use resolveOrgApprovalTier */
export const resolveWireApprovalTier = resolveOrgApprovalTier;
