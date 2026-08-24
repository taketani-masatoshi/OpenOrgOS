import type { OrgApprovalRequest, OrgApprovalStatus } from "../../../../schemas/org/approval.js";
import type { OperatorAttestation } from "../../../../schemas/org/operator-attestation.js";
import { emitOrgAuditAttested } from "../audit-emit.js";
import {
  loadOrgApprovalRegistry,
  saveOrgApprovalRegistry,
  withOrgApprovalRegistryLock,
} from "./registry.js";

export interface RejectOrgApprovalOptions {
  approvalId: string;
  approverId: string;
  reason?: string;
  /** When false, skip audit-chain emit (tests only). */
  emitAudit?: boolean;
}

export interface RejectOrgApprovalResult {
  approval: OrgApprovalRequest;
  auditEnvelope?: ReturnType<typeof emitOrgAuditAttested>;
}

export function rejectOrgApproval(opts: RejectOrgApprovalOptions): RejectOrgApprovalResult {
  return withOrgApprovalRegistryLock(() => {
    const registry = loadOrgApprovalRegistry();
    const idx = registry.approvals.findIndex((a) => a.approval_id === opts.approvalId);
    if (idx < 0) {
      throw new Error(`Approval ${opts.approvalId} not found`);
    }
    const approval = registry.approvals[idx]!;
    if (approval.status !== "pending_approval") {
      throw new Error(`Approval ${opts.approvalId} is not pending approval`);
    }

    const rejectedAt = new Date().toISOString();
    const attestation: OperatorAttestation = {
      operator_id: approval.proposed_by,
      approver_id: opts.approverId,
      approved_at: rejectedAt,
      basis: approval.scope === "internal" ? "internal_policy" : "existing_contract",
      basis_ref: approval.subject_ref ?? approval.wire?.contract_id,
      approval_id: approval.approval_id,
      notice_id: approval.scope === "wire" ? approval.approval_id : undefined,
      approval_policy_ref: approval.approval_policy_ref,
    };

    let auditEnvelope: ReturnType<typeof emitOrgAuditAttested> | undefined;
    if (opts.emitAudit !== false) {
      auditEnvelope = emitOrgAuditAttested({
        approval,
        attestation,
        kind: "approval.rejected",
        rejectReason: opts.reason,
      });
    }

    registry.approvals[idx] = {
      ...approval,
      status: "rejected",
      approver_id: opts.approverId,
      rejected_at: rejectedAt,
      reject_reason: opts.reason,
      audit_event_id: auditEnvelope?.event_id,
    };
    saveOrgApprovalRegistry(registry);
    return { approval: registry.approvals[idx]!, auditEnvelope };
  });
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
