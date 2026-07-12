import type { OrgApprovalRequest } from "../../../../schemas/org/approval.js";
import type { OperatorAttestation } from "../../../../schemas/org/operator-attestation.js";
import type { OrgApprovalTier } from "../../../../schemas/org/tier.js";
import type { WireApprovalGateResult } from "../../../../schemas/protocol/wire-approval.js";
import { assertWireGovernanceApproval } from "../../jurisdiction/wire-governance/index.js";
import { isCorrespondenceApprovalSubject } from "../../correspondence/review.js";
import { findOrgApproval, loadOrgApprovalRegistry, saveOrgApprovalRegistry } from "./registry.js";
import { emitOrgAuditAttested } from "../audit-emit.js";

export interface ApproveOrgApprovalOptions {
  approvalId: string;
  approverId: string;
  coApproverId?: string;
  operatorId?: string;
  basis?: OperatorAttestation["basis"];
  basisRef?: string;
  /** When false, caller emits audit after side effects (wire transmit). */
  emitAudit?: boolean;
  /** correspondence.* — must be true when human confirmed draft review */
  humanReviewConfirmed?: boolean;
}

export interface ApproveOrgApprovalResult {
  approval: OrgApprovalRequest;
  gate: WireApprovalGateResult;
  attestation: OperatorAttestation;
  auditEnvelope?: ReturnType<typeof emitOrgAuditAttested>;
}

function resolveAmount(approval: OrgApprovalRequest): { value: number; currency: string } {
  if (approval.amount) return approval.amount;
  return { value: 0, currency: "JPY" };
}

function defaultBasis(approval: OrgApprovalRequest): OperatorAttestation["basis"] {
  if (approval.scope === "internal") return "internal_policy";
  if (approval.wire?.transaction_type === "contract.executed") {
    return "new_contract_instrument";
  }
  return "existing_contract";
}

export function evaluateOrgApprovalGate(
  approval: OrgApprovalRequest,
  approverId: string,
  coApproverId?: string
): WireApprovalGateResult {
  const amount = resolveAmount(approval);
  return assertWireGovernanceApproval({
    amount: amount.value,
    currency: amount.currency,
    approverId,
    coApproverId,
    policyRef: approval.approval_policy_ref,
  });
}

export function approveOrgApproval(opts: ApproveOrgApprovalOptions): ApproveOrgApprovalResult {
  const registry = loadOrgApprovalRegistry();
  const idx = registry.approvals.findIndex((a) => a.approval_id === opts.approvalId);
  if (idx < 0) {
    throw new Error(`Approval ${opts.approvalId} not found`);
  }
  const approval = registry.approvals[idx]!;
  if (approval.status !== "pending_approval") {
    throw new Error(
      `Approval ${opts.approvalId} status is ${approval.status}, expected pending_approval`
    );
  }

  if (isCorrespondenceApprovalSubject(approval.subject_type) && !opts.humanReviewConfirmed) {
    throw new Error(
      `Correspondence approval ${opts.approvalId} requires humanReviewConfirmed after draft review — ` +
        `use: org approval approve --id ${opts.approvalId} --approver "<CEO>" --reviewed`
    );
  }

  const gate = evaluateOrgApprovalGate(approval, opts.approverId, opts.coApproverId);
  const approvedAt = new Date().toISOString();
  const attestation: OperatorAttestation = {
    operator_id: opts.operatorId ?? approval.proposed_by,
    approver_id: opts.approverId,
    co_approver_id: opts.coApproverId,
    approval_tier: gate.tier as OrgApprovalTier,
    approved_at: approvedAt,
    basis: opts.basis ?? defaultBasis(approval),
    basis_ref: opts.basisRef ?? approval.subject_ref ?? approval.wire?.contract_id,
    approval_id: approval.approval_id,
    notice_id: approval.scope === "wire" ? approval.approval_id : undefined,
    approval_policy_ref: gate.policyRef,
  };

  const emitAudit = opts.emitAudit ?? approval.scope === "internal";
  let auditEnvelope: ReturnType<typeof emitOrgAuditAttested> | undefined;
  if (emitAudit) {
    auditEnvelope = emitOrgAuditAttested({
      approval,
      attestation,
      kind: "approval.granted",
    });
  }

  registry.approvals[idx] = {
    ...approval,
    status: approval.scope === "internal" ? "approved" : approval.status,
    approver_id: opts.approverId,
    co_approver_id: opts.coApproverId,
    approval_tier: gate.tier,
    approved_at: approvedAt,
    audit_event_id: auditEnvelope?.event_id,
    ...(isCorrespondenceApprovalSubject(approval.subject_type) && opts.humanReviewConfirmed
      ? {
          human_review_confirmed_at: approvedAt,
          approved_by_operator_id: opts.operatorId,
        }
      : {}),
  };
  saveOrgApprovalRegistry(registry);

  return {
    approval: registry.approvals[idx]!,
    gate,
    attestation,
    auditEnvelope,
  };
}

export function completeOrgApprovalWire(opts: {
  approvalId: string;
  transactionId: string;
  wireEventId: string;
  attestation: OperatorAttestation;
}): { approval: OrgApprovalRequest; auditEnvelope: ReturnType<typeof emitOrgAuditAttested> } {
  const registry = loadOrgApprovalRegistry();
  const idx = registry.approvals.findIndex((a) => a.approval_id === opts.approvalId);
  if (idx < 0) {
    throw new Error(`Approval ${opts.approvalId} not found`);
  }
  const approval = registry.approvals[idx]!;
  if (!approval.wire) {
    throw new Error(`Approval ${opts.approvalId} has no wire details`);
  }

  const auditEnvelope = emitOrgAuditAttested({
    approval,
    attestation: opts.attestation,
    kind: "approval.granted",
    transactionId: opts.transactionId,
    wireEventId: opts.wireEventId,
  });

  registry.approvals[idx] = {
    ...approval,
    status: "completed",
    audit_event_id: auditEnvelope.event_id,
    wire: {
      ...approval.wire,
      transaction_id: opts.transactionId,
      wire_event_id: opts.wireEventId,
    },
  };
  saveOrgApprovalRegistry(registry);
  return { approval: registry.approvals[idx]!, auditEnvelope };
}

export { findOrgApproval };
