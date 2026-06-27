import type { WireApprovalTier } from "../../../../schemas/protocol/wire-approval.js";
import {
  assertApproverAuthorized as assertOrgApproverAuthorized,
  loadAuthorizedApprovers,
  normalizePersonName,
} from "../../org/authorized-approvers.js";

export { loadAuthorizedApprovers, normalizePersonName };

export function assertApproverAuthorized(approverId: string, tier: WireApprovalTier): void {
  assertOrgApproverAuthorized(approverId, tier);
}
