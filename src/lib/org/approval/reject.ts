import type { OrgApprovalRequest, OrgApprovalStatus } from "../../../../schemas/org/approval.js";
import { loadOrgApprovalRegistry, saveOrgApprovalRegistry } from "./registry.js";

export interface RejectOrgApprovalOptions {
  approvalId: string;
  approverId: string;
  reason?: string;
}

export function rejectOrgApproval(opts: RejectOrgApprovalOptions): OrgApprovalRequest {
  const registry = loadOrgApprovalRegistry();
  const idx = registry.approvals.findIndex((a) => a.approval_id === opts.approvalId);
  if (idx < 0) {
    throw new Error(`Approval ${opts.approvalId} not found`);
  }
  const approval = registry.approvals[idx]!;
  if (approval.status !== "pending_approval") {
    throw new Error(`Approval ${opts.approvalId} is not pending approval`);
  }
  registry.approvals[idx] = {
    ...approval,
    status: "rejected",
    approver_id: opts.approverId,
    rejected_at: new Date().toISOString(),
    reject_reason: opts.reason,
  };
  saveOrgApprovalRegistry(registry);
  return registry.approvals[idx]!;
}

export function listOrgApprovals(filter?: {
  scope?: OrgApprovalRequest["scope"];
  status?: OrgApprovalStatus;
}): OrgApprovalRequest[] {
  return loadOrgApprovalRegistry()
    .approvals.filter((a) => {
      if (filter?.scope && a.scope !== filter.scope) return false;
      if (filter?.status && a.status !== filter.status) return false;
      return true;
    })
    .sort((a, b) => a.proposed_at.localeCompare(b.proposed_at));
}
