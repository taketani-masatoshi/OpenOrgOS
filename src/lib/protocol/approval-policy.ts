/** @deprecated Import from ./wire-approval-gate.js — jurisdiction logic lives under src/lib/jurisdiction/wire-governance/ */
export {
  assertWireApproval,
  assertReg004Approval,
  resolveWireApprovalTier,
  resolveReg004Tier,
  resolveNoticeAmountForWire,
  resolveNoticeAmount,
  loadAuthorizedApprovers,
  normalizePersonName,
  resolveJurisdictionApprovalPolicy,
  type WireApprovalGateInput,
  type WireApprovalGateResult,
  type WireApprovalTier,
  type Reg004Tier,
  type Reg004ApprovalInput,
  type Reg004ApprovalResult,
} from "./wire-approval-gate.js";
